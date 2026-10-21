import { bot } from "@/lib/telegram/bot";
import { webhookCallback } from "grammy";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const handleWebhook = webhookCallback(bot, "std/http");

export async function POST(req: Request) {
  if (config.telegram.secretToken) {
    const tokenHeader = req.headers.get("x-telegram-bot-api-secret-token");
    if (tokenHeader !== config.telegram.secretToken) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    return await handleWebhook(req);
  } catch (error) {
    console.error("Erro no webhook:", error);
    return new Response("OK", { status: 200 });
  }
}

export async function GET() {
  return new Response("Telegram Webhook Endpoint is Running 🟢", {
    status: 200,
  });
}
