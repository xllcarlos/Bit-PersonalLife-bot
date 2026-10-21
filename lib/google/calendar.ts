import { google, calendar_v3 } from "googleapis";
import { config } from "../config";
import { toLocalIso } from "../time";

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  /** ISO com offset (-03:00) para eventos com horário; "YYYY-MM-DD" para dia inteiro. */
  start: string;
  /** Para dia inteiro, é o ÚLTIMO dia (inclusivo). */
  end: string;
  allDay: boolean;
  writable: boolean;
}

let cachedClient: calendar_v3.Calendar | null = null;

function getCalendarClient(): calendar_v3.Calendar {
  if (cachedClient) return cachedClient;
  if (!config.google.clientEmail || !config.google.privateKey) {
    throw new Error(
      "Credenciais do Google Calendar não configuradas (GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)."
    );
  }
  const auth = new google.auth.JWT({
    email: config.google.clientEmail,
    key: config.google.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  cachedClient = google.calendar({ version: "v3", auth });
  return cachedClient;
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function mapEvent(
  item: calendar_v3.Schema$Event,
  calendarId: string,
  calendarName: string,
  writable: boolean
): CalendarEvent | null {
  if (!item.id || item.status === "cancelled") return null;
  // Ignora convites recusados: não ocupam o seu tempo.
  if (item.attendees?.some((a) => a.self && a.responseStatus === "declined")) return null;

  const allDay = !item.start?.dateTime && !!item.start?.date;
  if (allDay) {
    if (!item.start?.date || !item.end?.date) return null;
    return {
      id: item.id,
      calendarId,
      calendarName,
      title: item.summary || "(sem título)",
      start: item.start.date,
      end: previousDay(item.end.date), // o Google devolve o fim EXCLUSIVO
      allDay: true,
      writable,
    };
  }

  if (!item.start?.dateTime || !item.end?.dateTime) return null;
  return {
    id: item.id,
    calendarId,
    calendarName,
    title: item.summary || "(sem título)",
    start: toLocalIso(new Date(item.start.dateTime)),
    end: toLocalIso(new Date(item.end.dateTime)),
    allDay: false,
    writable,
  };
}

/**
 * Lista eventos da agenda principal e das agendas extras.
 * Lança erro se a agenda principal falhar: devolver lista vazia faria o secretário
 * dizer que o dia está livre quando, na verdade, não conseguimos ler nada.
 */
export async function listEvents(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const targets = [
    { id: config.google.calendarId, writable: true },
    ...config.google.extraCalendarIds
      .filter((id) => id !== config.google.calendarId)
      .map((id) => ({ id, writable: false })),
  ];

  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const res = await calendar.events.list({
        calendarId: target.id,
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250,
      });
      const name = res.data.summary || target.id;
      return (res.data.items ?? [])
        .map((item) => mapEvent(item, target.id, name, target.writable))
        .filter((e): e is CalendarEvent => e !== null);
    })
  );

  const [main, ...extras] = results;
  if (main.status === "rejected") {
    const reason = main.reason instanceof Error ? main.reason.message : String(main.reason);
    throw new Error(`Não consegui ler a agenda principal: ${reason}`);
  }
  extras.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`Agenda extra "${targets[i + 1].id}" não pôde ser lida:`, r.reason);
    }
  });

  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all.slice(0, config.scheduler.maxEvents);
}

export async function createEvent(params: {
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
}): Promise<{ id: string; htmlLink: string }> {
  const calendar = getCalendarClient();
  const res = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: params.title,
      description: params.description,
      start: { dateTime: params.startIso, timeZone: config.scheduler.timeZone },
      end: { dateTime: params.endIso, timeZone: config.scheduler.timeZone },
    },
  });
  return { id: res.data.id || "", htmlLink: res.data.htmlLink || "" };
}

export async function updateEvent(params: {
  calendarId: string;
  eventId: string;
  title?: string;
  startIso?: string;
  endIso?: string;
}): Promise<{ htmlLink: string }> {
  const calendar = getCalendarClient();
  const requestBody: calendar_v3.Schema$Event = {};
  if (params.title) requestBody.summary = params.title;
  if (params.startIso) {
    requestBody.start = { dateTime: params.startIso, timeZone: config.scheduler.timeZone };
  }
  if (params.endIso) {
    requestBody.end = { dateTime: params.endIso, timeZone: config.scheduler.timeZone };
  }
  const res = await calendar.events.patch({
    calendarId: params.calendarId,
    eventId: params.eventId,
    requestBody,
  });
  return { htmlLink: res.data.htmlLink || "" };
}

export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const calendar = getCalendarClient();
  await calendar.events.delete({ calendarId, eventId });
}
