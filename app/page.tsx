export default function HomePage() {
  const card = {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "8px",
    padding: "24px",
    marginBottom: "24px",
  } as const;
  const code = {
    backgroundColor: "#0d1117",
    padding: "16px",
    borderRadius: "6px",
    overflowX: "auto",
    fontSize: "13px",
    color: "#79c0ff",
    border: "1px solid #21262d",
  } as const;

  return (
    <main style={{ maxWidth: "860px", margin: "0 auto", padding: "40px 20px", lineHeight: 1.6 }}>
      <h1 style={{ color: "#f0f6fc" }}>Routine AI Bot 🧠</h1>
      <p style={{ color: "#8b949e" }}>
        Secretário de agenda no Telegram: Gemini + Google Calendar (visível no Notion Calendar).
      </p>

      <section style={card}>
        <h2 style={{ marginTop: 0, color: "#58a6ff" }}>Ativar o webhook</h2>
        <p>
          Depois do deploy e de definir as variáveis na Vercel, abra no navegador (a chave é o seu{" "}
          <code>TELEGRAM_SECRET_TOKEN</code>):
        </p>
        <pre style={code}>{`/api/setup-webhook?key=SEU_TELEGRAM_SECRET_TOKEN`}</pre>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0, color: "#58a6ff" }}>Variáveis de ambiente</h2>
        <p>
          A lista completa e comentada está em <code>.env.example</code>. Obrigatórias:{" "}
          <code>TELEGRAM_BOT_TOKEN</code>, <code>TELEGRAM_SECRET_TOKEN</code>,{" "}
          <code>ALLOWED_TELEGRAM_USER_ID</code>, <code>GEMINI_API_KEY</code>,{" "}
          <code>GOOGLE_CLIENT_EMAIL</code>, <code>GOOGLE_PRIVATE_KEY</code>,{" "}
          <code>GOOGLE_CALENDAR_ID</code> e o Redis do Upstash.
        </p>
      </section>
    </main>
  );
}
