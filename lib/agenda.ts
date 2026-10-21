import { config } from "./config";
import { listEvents, CalendarEvent } from "./google/calendar";
import { isNotionConfigured, listTasks } from "./notion/tasks";

/**
 * Agenda unificada: Google Calendar (obrigatório) + tarefas do Notion (opcional).
 * Falha do Google interrompe tudo. Falha do Notion vira aviso, para o secretário não
 * afirmar que o dia está livre sem avisar que não leu as tarefas.
 */
export async function loadAgenda(
  timeMinIso: string,
  timeMaxIso: string
): Promise<{ events: CalendarEvent[]; warnings: string[] }> {
  const warnings: string[] = [];

  const [google, notion] = await Promise.allSettled([
    listEvents(timeMinIso, timeMaxIso),
    isNotionConfigured() ? listTasks(timeMinIso, timeMaxIso) : Promise.resolve([] as CalendarEvent[]),
  ]);

  if (google.status === "rejected") throw google.reason;

  let events = google.value;
  if (notion.status === "fulfilled") {
    events = [...events, ...notion.value];
  } else {
    console.warn("Falha ao ler tarefas do Notion:", notion.reason);
    const reason = notion.reason instanceof Error ? notion.reason.message : String(notion.reason);
    warnings.push(`Não consegui ler as tarefas do Notion (${reason.slice(0, 120)}).`);
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events: events.slice(0, config.scheduler.maxEvents), warnings };
}
