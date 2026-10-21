import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  isValidIso,
  localDate,
  overlaps,
  startOfDayIso,
  toLocalIso,
} from "../lib/time";

describe("fuso horário de São Paulo", () => {
  // 02:36 UTC do dia 21 ainda é 23:36 do dia 20 em Brasília (o bug do "hoje errado").
  const lateNight = new Date("2026-10-21T02:36:00Z");

  it("converte UTC para ISO local", () => {
    expect(toLocalIso(lateNight)).toBe("2026-10-20T23:36:00-03:00");
  });

  it("considera 'hoje' pelo dia local, não pelo UTC", () => {
    expect(localDate(lateNight)).toBe("2026-10-20");
  });

  it("início do dia é 00:00 local (inclui eventos que já passaram hoje)", () => {
    expect(startOfDayIso(lateNight)).toBe("2026-10-20T00:00:00-03:00");
  });

  it("não devolve hora 24 à meia-noite", () => {
    expect(toLocalIso(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21T00:00:00-03:00");
  });

  it("soma dias", () => {
    expect(addDaysIso("2026-10-20T00:00:00-03:00", 1)).toBe("2026-10-21T03:00:00.000Z");
  });
});

describe("overlaps", () => {
  it("detecta sobreposição", () => {
    expect(
      overlaps("2026-10-20T10:00:00-03:00", "2026-10-20T11:00:00-03:00", "2026-10-20T10:30:00-03:00", "2026-10-20T12:00:00-03:00")
    ).toBe(true);
  });

  it("eventos encostados não conflitam", () => {
    expect(
      overlaps("2026-10-20T10:00:00-03:00", "2026-10-20T11:00:00-03:00", "2026-10-20T11:00:00-03:00", "2026-10-20T12:00:00-03:00")
    ).toBe(false);
  });
});

describe("isValidIso", () => {
  it("valida datas", () => {
    expect(isValidIso("2026-10-20T10:00:00-03:00")).toBe(true);
    expect(isValidIso("amanhã")).toBe(false);
  });
});
