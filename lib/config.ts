const splitList = (value?: string): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    secretToken: process.env.TELEGRAM_SECRET_TOKEN || "",
    allowedUserId: process.env.ALLOWED_TELEGRAM_USER_ID || "",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    // Lista separada por vírgula, vazia por padrão: hoje só o modelo principal está disponível.
    // Se a Google liberar outro modelo, basta listá-lo aqui, sem alterar código.
    fallbackModels: splitList(process.env.GEMINI_FALLBACK_MODELS),
  },
  google: {
    // Com Service Account, "primary" aponta para a agenda vazia do próprio robô!
    // Por isso usamos o e-mail real da agenda compartilhada.
    calendarId:
      process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_CALENDAR_ID !== "primary"
        ? process.env.GOOGLE_CALENDAR_ID.trim()
        : "carlossantana.casds@gmail.com",
    // Agendas extras, somente leitura (ex: Família, Feriados). Separadas por vírgula.
    extraCalendarIds: splitList(process.env.GOOGLE_EXTRA_CALENDAR_IDS),
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY || "",
    databaseId: process.env.NOTION_TASK_DATABASE_ID || "",
    // Nomes EXATOS das colunas da tabela de tarefas.
    titleProperty: process.env.NOTION_TITLE_PROPERTY || "Nome da tarefa",
    dateProperty: process.env.NOTION_DATE_PROPERTY || "Prazo",
    // Usado só para reconhecer tarefas já concluídas (elas não bloqueiam horário).
    statusProperty: process.env.NOTION_STATUS_PROPERTY || "Status",
    doneStatus: process.env.NOTION_DONE_STATUS || "Concluído",
  },
  redis: {
    // Integração Upstash da Vercel injeta KV_REST_API_*; o painel do Upstash usa UPSTASH_REDIS_REST_*.
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
  },
  scheduler: {
    timeZone: "America/Sao_Paulo",
    // O Brasil não tem horário de verão desde 2019, então o offset é fixo.
    utcOffset: "-03:00",
    lookaheadDays: 14,
    maxEvents: 300,
  },
};

/** Variáveis obrigatórias que ainda não foram definidas. */
export function getMissingEnv(): string[] {
  const required: Array<[string, string]> = [
    ["TELEGRAM_BOT_TOKEN", config.telegram.botToken],
    ["TELEGRAM_SECRET_TOKEN", config.telegram.secretToken],
    ["ALLOWED_TELEGRAM_USER_ID", config.telegram.allowedUserId],
    ["GEMINI_API_KEY", config.gemini.apiKey],
    ["GOOGLE_CLIENT_EMAIL", config.google.clientEmail],
    ["GOOGLE_PRIVATE_KEY", config.google.privateKey],
    ["GOOGLE_CALENDAR_ID", process.env.GOOGLE_CALENDAR_ID || ""],
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}
