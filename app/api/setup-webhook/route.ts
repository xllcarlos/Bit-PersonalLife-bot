import { bot } from "@/lib/telegram/bot";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    url.host;
  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const webhookUrl = `${protocol}://${host}/api/webhook`;

  if (!config.telegram.botToken) {
    return Response.json(
      { error: "TELEGRAM_BOT_TOKEN não configurado no ambiente." },
      { status: 400 }
    );
  }

  try {
    const success = await bot.api.setWebhook(webhookUrl, {
      secret_token: config.telegram.secretToken || undefined,
      drop_pending_updates: true,
    });

    const info = await bot.api.getWebhookInfo();

    return Response.json({
      success,
      message: "Webhook configurado com sucesso no Telegram! 🚀",
      webhookUrl,
      telegramInfo: info,
    });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        error: error.message || error,
      },
      { status: 500 }
    );
  }
}
