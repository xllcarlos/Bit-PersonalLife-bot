import { timingSafeEqual } from "crypto";
import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram/bot";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
// Gemini + Google Calendar podem passar dos 10s padrão da Vercel.
export const maxDuration = 60;

// IMPORTANTE: o grammY encerra o handler após 10s por padrão. Nesse caso respondíamos 200 e a
// Vercel congelava a função com o trabalho pela metade; a resposta só saía na mensagem seguinte.
// Deixamos o timeout do grammY logo abaixo do maxDuration.
const handleWebhook = webhookCallback(bot, "std/http", { timeoutMilliseconds: 55_000 });

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  // Sem segredo configurado, recusamos tudo em vez de aceitar qualquer requisição.
  if (!config.telegram.secretToken) {
    return new Response("TELEGRAM_SECRET_TOKEN não configurado", { status: 500 });
  }
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(header, config.telegram.secretToken)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return await handleWebhook(req);
  } catch (error) {
    console.error("Erro no webhook:", error);
    // 200 evita que o Telegram fique reenviando o mesmo update em loop.
    return new Response("OK", { status: 200 });
  }
}

export async function GET() {
  return new Response("Webhook ativo", { status: 200 });
}
