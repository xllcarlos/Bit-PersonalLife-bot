export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "860px",
        margin: "0 auto",
        padding: "40px 20px",
        lineHeight: "1.6",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #30363d",
          paddingBottom: "24px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: "20px",
            backgroundColor: "#23863622",
            color: "#3fb950",
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "12px",
            border: "1px solid #23863655",
          }}
        >
          🟢 Online no Vercel
        </div>
        <h1 style={{ fontSize: "32px", margin: "0 0 10px 0", color: "#f0f6fc" }}>
          Routine AI Bot 🧠
        </h1>
        <p style={{ fontSize: "16px", color: "#8b949e", margin: 0 }}>
          Assistente de Gestão de Agenda Racional e Dinâmica (Telegram + Gemini + Google Calendar + Notion Calendar).
        </p>
      </header>

      <section
        style={{
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "32px",
        }}
      >
        <h2 style={{ fontSize: "20px", marginTop: 0, color: "#58a6ff" }}>
          🚀 Ativação do Webhook do Telegram
        </h2>
        <p style={{ color: "#c9d1d9" }}>
          Após realizar o deploy na Vercel e configurar suas variáveis de ambiente, clique no botão abaixo para registrar o webhook:
        </p>
        <a
          href="/api/setup-webhook"
          target="_blank"
          style={{
            display: "inline-block",
            backgroundColor: "#238636",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "6px",
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "14px",
          }}
        >
          Conectar Webhook ao Telegram ⚡
        </a>
      </section>

      <section
        style={{
          backgroundColor: "#161b22",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "24px",
        }}
      >
        <h2 style={{ fontSize: "20px", marginTop: 0, color: "#58a6ff" }}>
          📋 Variáveis de Ambiente Necessárias (.env)
        </h2>
        <pre
          style={{
            backgroundColor: "#0d1117",
            padding: "16px",
            borderRadius: "6px",
            overflowX: "auto",
            fontSize: "13px",
            color: "#79c0ff",
            border: "1px solid #21262d",
          }}
        >
{`# Telegram
TELEGRAM_BOT_TOKEN="seu_token_do_botfather"
ALLOWED_TELEGRAM_USER_ID="seu_user_id"
TELEGRAM_SECRET_TOKEN="um_segredo_aleatorio"

# Gemini (Google AI Studio - 100% Gratuito)
GEMINI_API_KEY="sua_chave_do_ai_studio"

# Google Calendar (Service Account)
GOOGLE_CLIENT_EMAIL="seu-bot@seu-projeto.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
GOOGLE_CALENDAR_ID="carlossantana.casds@gmail.com"`}
        </pre>
      </section>
    </main>
  );
}
