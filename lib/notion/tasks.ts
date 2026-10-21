import { Client, isFullPage } from "@notionhq/client";
import { config } from "../config";
import { toLocalIso } from "../time";
import type { CalendarEvent } from "../google/calendar";

let client: Client | null = null;

export function isNotionConfigured(): boolean {
  return !!config.notion.apiKey && !!config.notion.databaseId;
}

function getClient(): Client {
  if (!isNotionConfigured()) {
    throw new Error("Notion não configurado (NOTION_API_KEY / NOTION_TASK_DATABASE_ID).");
  }
  return (client ??= new Client({ auth: config.notion.apiKey }));
}

/** Notion devolve datas só-dia ("2026-10-21") ou com hora ("2026-10-21T17:00:00.000-03:00"). */
const isDateOnly = (value: string) => !value.includes("T");

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
    calendarId: config.notion.databaseId,
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
  const tasks: CalendarEvent[] = [];
  let cursor: string | undefined;

  // No máximo 3 páginas de 100 resultados.
  for (let i = 0; i < 3; i++) {
    const res = await notion.databases.query({
      database_id: config.notion.databaseId,
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

/** Cria a tarefa só com nome e prazo; Status e as demais colunas ficam com o padrão da tabela. */
export async function createTask(params: {
  title: string;
  start: string;
  end?: string | null;
}): Promise<{ url: string }> {
  const page = await getClient().pages.create({
    parent: { database_id: config.notion.databaseId },
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

/** O Notion não apaga via API: a página vai para a lixeira (recuperável por 30 dias). */
export async function archiveTask(pageId: string): Promise<void> {
  await getClient().pages.update({ page_id: pageId, archived: true });
}
