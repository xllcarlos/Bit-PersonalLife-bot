import { describe, expect, it } from "vitest";
import { parseAssistantResponse } from "../lib/gemini/schema";

describe("parseAssistantResponse", () => {
  it("aceita consulta", () => {
    const r = parseAssistantResponse('{"intent":"query","message":"Hoje você está livre."}');
    expect(r.intent).toBe("query");
  });

  it("aceita JSON dentro de cerca de código", () => {
    const r = parseAssistantResponse('```json\n{"intent":"chat","message":"Oi"}\n```');
    expect(r.intent).toBe("chat");
  });

  it("aceita agendamento válido", () => {
    const r = parseAssistantResponse(
      '{"intent":"schedule","title":"Ler artigo","start":"2026-10-22T14:00:00-03:00","end":"2026-10-22T15:30:00-03:00","rationale":null}'
    );
    expect(r.intent).toBe("schedule");
  });

  it("rejeita fim antes do início", () => {
    expect(() =>
      parseAssistantResponse(
        '{"intent":"schedule","title":"X","start":"2026-10-22T15:00:00-03:00","end":"2026-10-22T14:00:00-03:00"}'
      )
    ).toThrow();
  });

  it("rejeita data inválida", () => {
    expect(() =>
      parseAssistantResponse('{"intent":"schedule","title":"X","start":"amanhã","end":"depois"}')
    ).toThrow();
  });

  it("rejeita exclusão sem eventId", () => {
    expect(() => parseAssistantResponse('{"intent":"delete"}')).toThrow();
  });

  it("rejeita intenção desconhecida", () => {
    expect(() => parseAssistantResponse('{"intent":"hack","message":"x"}')).toThrow();
  });
});
