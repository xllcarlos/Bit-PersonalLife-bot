import { z } from "zod";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data/hora inválida");
const transcribedText = z.string().nullish();

export const assistantSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("query"),
    message: z.string().min(1),
    transcribedText,
  }),
  z.object({
    intent: z.literal("chat"),
    message: z.string().min(1),
    transcribedText,
  }),
  z.object({
    intent: z.literal("schedule"),
    title: z.string().min(1),
    start: isoDate,
    end: isoDate,
    rationale: z.string().nullish(),
    transcribedText,
  }),
  z.object({
    intent: z.literal("update"),
    eventId: z.string().min(1),
    title: z.string().nullish(),
    start: isoDate.nullish(),
    end: isoDate.nullish(),
    transcribedText,
  }),
  z.object({
    intent: z.literal("delete"),
    eventId: z.string().min(1),
    transcribedText,
  }),
]);

export type AssistantResponse = z.infer<typeof assistantSchema>;

/** Remove cercas ```json que alguns modelos adicionam mesmo em modo JSON. */
export function extractJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

export function parseAssistantResponse(raw: string): AssistantResponse {
  const parsed = assistantSchema.parse(JSON.parse(extractJson(raw)));

  if (parsed.intent === "schedule" && Date.parse(parsed.end) <= Date.parse(parsed.start)) {
    throw new Error("Horário final anterior ao inicial na resposta do modelo.");
  }
  if (
    parsed.intent === "update" &&
    parsed.start &&
    parsed.end &&
    Date.parse(parsed.end) <= Date.parse(parsed.start)
  ) {
    throw new Error("Horário final anterior ao inicial na resposta do modelo.");
  }
  return parsed;
}
