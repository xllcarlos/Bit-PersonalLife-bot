import { Client, isFullPage } from "@notionhq/client";
import { config } from "../config";
import { toLocalIso } from "../time";
import type { CalendarEvent } from "../google/calendar";

let client: Client | null = null;
let resolvedDbId: string | null = null;

export function isNotionConfigured(): boolean {
  return !!config.notion.apiKey && !!config.notion.databaseId;
}

function getClient(): Client {
  if (!config.notion.apiKey) {
    throw new Error("NOTION_API_KEY não configurado.");
  }
  return (client ??= new Client({ auth: config.notion.apiKey }));
}

const isDateOnly = (value: string) => !value.includes("T");

/**
 * Resolve o ID real do banco de dados:
 * 1) Tenta usar o NOTION_TASK_DATABASE_ID diretamente.
 * 2) Se falhar (ex.: o ID copiado era da página-mãe ou de uma view), procura bancos filhos na página
 *    e também faz busca via `notion.search` pelos bancos compartilhados com a integração.
 */
export async function resolveDatabaseId(): Promise<string> {
  if (resolvedDbId) return resolvedDbId;
  const notion = getClient();
  const configuredId = config.notion.databaseId.trim();

  if (configuredId) {
    try {
      const db = await notion.databases.retrieve({ database_id: configuredId });
      resolvedDbId = db.id;
      return resolvedDbId;
    } catch {
      // Se não é um database_id válido/acessível, pode ser o ID de uma página que contém a tabela inline
      try {
        const blocks = await notion.blocks.children.list({ block_id: configuredId, page_size: 100 });
        const childDb = blocks.results.find((b: any) => b.type === "child_database");
        if (childDb) {
          resolvedDbId = childDb.id;
          return resolvedDbId;
        }
      } catch {
        // Ignora e tenta via search abaixo
      }
    }
  }

  // Último recurso: busca todos os bancos de dados que a integração tem permissão para ver
  const search = await notion.search({
    filter: { property: "object", value: "database" },
    page_size: 20,
  });

  if (search.results.length > 0) {
    resolvedDbId = search.results[0].id;
    return resolvedDbId;
  }

  // Verifica se há ao menos alguma página compartilhada para dar um diagnóstico exato
  const anyPage = await notion.search({ page_size: 5 });
  if (anyPage.results.length === 0) {
    throw new Error(
      "A integração do Notion ainda não tem acesso a NENHUMA página/tabela. No Notion, abra a página da tabela → clique em '•••' no topo direito → 'Conexões' (Connections) → adicione sua integração."
    );
  }

  throw new Error(
    `Não encontrei banco de dados no ID ${configuredId}. Páginas visíveis pela integração: ${anyPage.results.length}.`
  );
}

/** Diagnóstico detalhado do Notion para o comando /debug. */
export async function diagnoseNotion(): Promise<string[]> {
  const lines: string[] = [];
  if (!config.notion.apiKey) {
    return ["🔴 NOTION_API_KEY vazio."];
  }
  lines.push(`• ID configurado: ${config.notion.databaseId || "(vazio)"}`);

  try {
    const notion = getClient();
    const me = await notion.users.me({});
    lines.push(`• Bot autenticado no Notion: "${me.name || me.id}"`);

    const search = await notion.search({ page_size: 20 });
    lines.push(`• Itens compartilhados com este bot no Notion: ${search.results.length}`);

    for (const item of search.results) {
      const objType = item.object;
      let title = "(sem título)";
      if ("properties" in item && item.properties) {
        for (const prop of Object.values(item.properties as Record<string, any>)) {
          if (prop?.type === "title" && Array.isArray(prop.title)) {
            title = prop.title.map((t: any) => t.plain_text).join("") || title;
          }
        }
      }
      if ("title" in item && Array.isArray((item as any).title)) {
        title = (item as any).title.map((t: any) => t.plain_text).join("") || title;
      }
      lines.push(`  - [${objType}] "${title}" → ID: ${item.id}`);
    }

    const dbId = await resolveDatabaseId();
    lines.push(`🟢 Banco de dados resolvido com sucesso: ${dbId}`);
  } catch (err) {
    lines.push(`🔴 Erro Notion: ${err instanceof Error ? err.message : String(err)}`);
  }

  return lines;
}

/** Converte uma página da tabela de tarefas em evento. Devolve null se não tiver prazo. */
export function mapTaskPage(page: {
  id: string;
  properties: Record<string, any>;
}): CalendarEvent | null {
  const props = page.properties;
  const title =
    (props[config.notion.titleProperty]?.title as Array<{ plain_text: string }> | undefined)
      ?.map((t) => t.plain_text)
      .join("") || "(sem título)";

  const date = props[config.notion.dateProperty]?.date as
    | { start: string; end: string | null }
    | null
    | undefined;
  if (!date?.start) return null;

  const status = props[config.notion.statusProperty]?.status?.name as string | undefined;
  const done = status === config.notion.doneStatus;

  const base = {
    id: page.id,
    source: "notion" as const,
    calendarId: resolvedDbId || config.notion.databaseId,
    calendarName: "Notion · Tarefas",
    title,
    writable: true,
    done,
  };

  if (isDateOnly(date.start)) {
    return { ...base, start: date.start, end: date.end ?? date.start, allDay: true };
  }
  const start = toLocalIso(new Date(date.start));
  const end = toLocalIso(new Date(date.end ?? date.start));
  return { ...base, start, end, allDay: false };
}

/** Tarefas com prazo entre as duas datas (inclusive). */
export async function listTasks(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]> {
  const notion = getClient();
  const dbId = await resolveDatabaseId();
  const tasks: CalendarEvent[] = [];
  let cursor: string | undefined;

  for (let i = 0; i < 3; i++) {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        and: [
          { property: config.notion.dateProperty, date: { on_or_after: timeMinIso.slice(0, 10) } },
          { property: config.notion.dateProperty, date: { on_or_before: timeMaxIso.slice(0, 10) } },
        ],
      },
      sorts: [{ property: config.notion.dateProperty, direction: "ascending" }],
    });

    for (const page of res.results) {
      if (!isFullPage(page)) continue;
      const task = mapTaskPage(page as { id: string; properties: Record<string, any> });
      if (task) tasks.push(task);
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
  }
  return tasks;
}

function dateValue(start: string, end?: string | null) {
  return { date: { start, end: end ?? null } };
}

export async function createTask(params: {
  title: string;
  start: string;
  end?: string | null;
}): Promise<{ url: string }> {
  const dbId = await resolveDatabaseId();
  const page = await getClient().pages.create({
    parent: { database_id: dbId },
    properties: {
      [config.notion.titleProperty]: { title: [{ text: { content: params.title } }] },
      [config.notion.dateProperty]: dateValue(params.start, params.end),
    },
  });
  return { url: "url" in page ? page.url : "" };
}

export async function updateTask(params: {
  pageId: string;
  title?: string;
  start?: string;
  end?: string | null;
}): Promise<void> {
  const properties: Record<string, any> = {};
  if (params.title) {
    properties[config.notion.titleProperty] = { title: [{ text: { content: params.title } }] };
  }
  if (params.start) {
    properties[config.notion.dateProperty] = dateValue(params.start, params.end);
  }
  await getClient().pages.update({ page_id: params.pageId, properties });
}

export async function archiveTask(pageId: string): Promise<void> {
  await getClient().pages.update({ page_id: pageId, archived: true });
}
