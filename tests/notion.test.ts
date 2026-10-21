import { describe, expect, it } from "vitest";
import { mapTaskPage } from "../lib/notion/tasks";

describe("mapTaskPage (Notion Task Manager)", () => {
  it("mapeia tarefa com Prazo apenas-data e Nome da tarefa", () => {
    const task = mapTaskPage({
      id: "page-1",
      properties: {
        "Nome da tarefa": {
          title: [{ plain_text: "Texto Professor" }],
        },
        Prazo: {
          date: { start: "2026-10-20", end: null },
        },
        Status: {
          status: { name: "Não iniciado" },
        },
      },
    });

    expect(task).toEqual({
      id: "page-1",
      source: "notion",
      calendarId: "",
      calendarName: "Notion · Tarefas",
      title: "Texto Professor",
      start: "2026-10-20",
      end: "2026-10-20",
      allDay: true,
      writable: true,
      done: false,
    });
  });

  it("mapeia tarefa com janela de horário e status Concluído", () => {
    const task = mapTaskPage({
      id: "page-2",
      properties: {
        "Nome da tarefa": {
          title: [{ plain_text: "MICCAI Paper" }],
        },
        Prazo: {
          date: {
            start: "2026-10-21T15:00:00.000-03:00",
            end: "2026-10-21T16:30:00.000-03:00",
          },
        },
        Status: {
          status: { name: "Concluído" },
        },
      },
    });

    expect(task?.allDay).toBe(false);
    expect(task?.start).toBe("2026-10-21T15:00:00-03:00");
    expect(task?.end).toBe("2026-10-21T16:30:00-03:00");
    expect(task?.done).toBe(true);
  });

  it("retorna null se não houver Prazo definido", () => {
    const task = mapTaskPage({
      id: "page-3",
      properties: {
        "Nome da tarefa": {
          title: [{ plain_text: "Sem prazo" }],
        },
        Prazo: { date: null },
      },
    });
    expect(task).toBeNull();
  });
});
