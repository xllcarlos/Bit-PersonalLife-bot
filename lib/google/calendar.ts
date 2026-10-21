import { google } from "googleapis";
import { config } from "../config";

export interface BusySlot {
  id?: string;
  title: string;
  start: string;
  end: string;
  source: string;
}

function getCalendarClient() {
  if (!config.google.clientEmail || !config.google.privateKey) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: config.google.clientEmail,
    key: config.google.privateKey,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

export async function createGoogleCalendarEvent(params: {
  title: string;
  startIso: string;
  endIso: string;
  description?: string;
}): Promise<{ id: string; htmlLink: string }> {
  const calendar = getCalendarClient();
  if (!calendar) {
    throw new Error(
      "Credenciais do Google Calendar não configuradas (GOOGLE_CLIENT_EMAIL ou GOOGLE_PRIVATE_KEY no .env)."
    );
  }

  const response = await calendar.events.insert({
    calendarId: config.google.calendarId,
    requestBody: {
      summary: params.title,
      description: params.description,
      start: {
        dateTime: params.startIso,
        timeZone: config.scheduler.timeZone,
      },
      end: {
        dateTime: params.endIso,
        timeZone: config.scheduler.timeZone,
      },
    },
  });

  return {
    id: response.data.id || "",
    htmlLink: response.data.htmlLink || "",
  };
}

export async function deleteGoogleCalendarEvent(eventId: string): Promise<boolean> {
  const calendar = getCalendarClient();
  if (!calendar) {
    throw new Error("Google Calendar não configurado.");
  }

  await calendar.events.delete({
    calendarId: config.google.calendarId,
    eventId,
  });

  return true;
}

export async function getUpcomingGoogleEvents(
  startDateIso: string,
  endDateIso: string
): Promise<BusySlot[]> {
  try {
    const calendar = getCalendarClient();
    if (!calendar) {
      return [];
    }

    const response = await calendar.events.list({
      calendarId: config.google.calendarId,
      timeMin: startDateIso,
      timeMax: endDateIso,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250, // Permite ler todo o período de até 2 a 3 semanas
    });

    const items = response.data.items || [];
    const busySlots: BusySlot[] = [];

    for (const item of items) {
      const start = item.start?.dateTime || item.start?.date;
      const end = item.end?.dateTime || item.end?.date;
      if (start && end) {
        busySlots.push({
          id: item.id || undefined,
          title: item.summary || "Ocupado",
          start,
          end,
          source: "Google Calendar",
        });
      }
    }

    return busySlots;
  } catch (error) {
    console.warn("Aviso: Falha ao obter eventos do Google Calendar:", error);
    return [];
  }
}
