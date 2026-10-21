/** Ação aguardando confirmação do usuário (guardada no Redis). */
export type PendingAction =
  | {
      kind: "create";
      title: string;
      start: string;
      end: string;
      rationale: string;
    }
  | {
      /** Tarefa na tabela do Notion. `start` pode ser só data ("YYYY-MM-DD") ou data e hora. */
      kind: "task";
      title: string;
      start: string;
      end?: string;
    }
  | {
      kind: "update";
      source: "google" | "notion";
      eventId: string;
      calendarId: string;
      currentTitle: string;
      title?: string;
      start?: string;
      end?: string;
    }
  | {
      kind: "delete";
      source: "google" | "notion";
      eventId: string;
      calendarId: string;
      title: string;
    };
