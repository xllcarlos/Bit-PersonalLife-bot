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
      kind: "update";
      eventId: string;
      calendarId: string;
      currentTitle: string;
      title?: string;
      start?: string;
      end?: string;
    }
  | {
      kind: "delete";
      eventId: string;
      calendarId: string;
      title: string;
    };
