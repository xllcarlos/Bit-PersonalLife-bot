export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
    secretToken: process.env.TELEGRAM_SECRET_TOKEN || "",
    allowedUserId: process.env.ALLOWED_TELEGRAM_USER_ID || "",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    fallbackModels: ["gemini-2.5-flash", "gemini-1.5-flash"],
  },
  google: {
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || "",
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  },
  scheduler: {
    timeZone: "America/Sao_Paulo",
    // Janela padrão de leitura de eventos futuros (14 dias para cobrir a semana atual e a próxima)
    lookaheadDays: 14,
    // Horário geral de sono para não sugerir nada na madrugada
    sleepWindow: { start: "23:00", end: "06:00" },
  },
};
