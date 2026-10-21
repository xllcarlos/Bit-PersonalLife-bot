import { timingSafeEqual } from "crypto";
import { bot } from "@/lib/telegram/bot";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Registra o webhook no Telegram. Protegido: exige ?key=<TELEGRAM_SECRET_TOKEN>.
 * Ex: https://seu-bot.vercel.app/api/setup-webhook?key=SEU_SEGREDO
 */
export async function GET(req: Request) {
  const url = new URL(req.url);

  if (!config.telegram.botToken || !config.telegram.secretToken) {
    return Response.json(
      { error: "Defina TELEGRAM_BOT_TOKEN e TELEGRAM_SECRET_TOKEN na Vercel." },
      { status: 400 }
    );
  }
  if (!safeEqual(url.searchParams.get("key") ?? "", config.telegram.secretToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const webhookUrl = `${protocol}://${host}/api/webhook`;

  try {
    const success = await bot.api.setWebhook(webhookUrl, {
      secret_token: config.telegram.secretToken,
      drop_pending_updates: true,
    });
    const info = await bot.api.getWebhookInfo();
    return Response.json({ success, message: "Webhook configurado.", webhookUrl, telegramInfo: info });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
