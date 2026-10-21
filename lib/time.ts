import { config } from "./config";

const TZ = config.scheduler.timeZone;
const OFFSET = config.scheduler.utcOffset;
const DAY_MS = 86_400_000;

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(date: Date) {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** Converte um instante para ISO no fuso de São Paulo (ex: 2026-10-20T23:36:00-03:00). */
export function toLocalIso(date: Date): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${OFFSET}`;
}

/** Data local (YYYY-MM-DD) em São Paulo. */
export function localDate(date: Date): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 00:00 de hoje em São Paulo, em ISO. */
export function startOfDayIso(date: Date): string {
  return `${localDate(date)}T00:00:00${OFFSET}`;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

export function describeNow(date: Date): string {
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long" }).format(date);
  const p = parts(date);
  return `${weekday}, ${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute} (${TZ}, UTC${OFFSET})`;
}

export function isValidIso(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

export function formatDateBr(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formata uma data "YYYY-MM-DD" (eventos de dia inteiro) sem deslocar o dia por fuso. */
export function formatDayBr(day: string): string {
  return new Date(`${day}T12:00:00${OFFSET}`).toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTimeBr(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRangeBr(startIso: string, endIso: string): string {
  const sameDay = localDate(new Date(startIso)) === localDate(new Date(endIso));
  return `${formatDateBr(startIso)} – ${sameDay ? formatTimeBr(endIso) : formatDateBr(endIso)}`;
}
