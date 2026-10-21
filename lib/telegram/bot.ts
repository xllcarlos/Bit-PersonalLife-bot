import { Bot } from "grammy";
import { config } from "../config";
import {
  processSecretaryInput,
  AssistantResponse,
} from "../gemini/scheduler";
import {
  createGoogleCalendarEvent,
  getUpcomingGoogleEvents,
  deleteGoogleCalendarEvent,
  BusySlot,
} from "../google/calendar";
import { createProposalKeyboard } from "./keyboards";

// CRÍTICO PARA SERVERLESS NA VERCEL:
// Desativa webhookReply para que todas as chamadas à API do Telegram sejam concluídas
// antes de finalizar a função serverless, eliminando o congelamento da resposta.
export const bot = new Bot(config.telegram.botToken || "dummy_token_for_build", {
  client: {
    canUseWebhookReply: () => false,
  },
});

function isAuthorized(userId?: number): boolean {
  if (!config.telegram.allowedUserId) {
    return true;
  }
  return String(userId) === String(config.telegram.allowedUserId);
}

function formatDateBr(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("pt-BR", {
      timeZone: config.scheduler.timeZone,
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

// /start
bot.command("start", async (ctx) => {
  if (!isAuthorized(ctx.from?.id)) {
    return ctx.reply("⛔ Acesso não autorizado a este bot.");
  }

  await ctx.reply(
    `👋 Olá, Carlos! Sou o seu **Secretário de Agenda Pessoal**.\n\n` +
      `Estou conectado à sua agenda do Google e acompanho sua rotina em tempo real.\n\n` +
      `🎙️ **O que você pode me pedir por áudio ou texto:**\n` +
      `• *\"Como está a minha agenda hoje?\"*\n` +
      `• *\"O que eu tenho para fazer amanhã?\"*\n` +
      `• *\"Preciso ler o artigo do MICCAI na quinta à tarde, dura 1h30\"*\n` +
      `• *\"Desmarca a reunião de amanhã às 14h\"*\n\n` +
      `Estou pronto! O que gostaria de ver ou agendar?`,
    { parse_mode: "Markdown" }
  );
});

// /agenda
bot.command("agenda", async (ctx) => {
  if (!isAuthorized(ctx.from?.id)) return;
  await handleUserSecretaryInput(ctx, { text: "Como está a minha agenda hoje e nos próximos dias?" });
});

// Process user input (voice or text)
async function handleUserSecretaryInput(
  ctx: any,
  input: { text?: string; voiceFileId?: string }
) {
  if (!isAuthorized(ctx.from?.id)) {
    return ctx.reply("⛔ Acesso não autorizado.");
  }

  // Mostra "digitando..." ou "gravando..." nativo no Telegram
  await ctx.replyWithChatAction(input.voiceFileId ? "record_voice" : "typing");

  try {
    let audioBase64: string | undefined;

    if (input.voiceFileId) {
      const file = await ctx.api.getFile(input.voiceFileId);
      if (file.file_path) {
        const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
        const res = await fetch(fileUrl);
        const arrayBuf = await res.arrayBuffer();
        audioBase64 = Buffer.from(arrayBuf).toString("base64");
      }
    }

    // Busca compromissos reais dos próximos 14 a 21 dias
    const now = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + config.scheduler.lookaheadDays);

    const busySlots: BusySlot[] = await getUpcomingGoogleEvents(
      now.toISOString(),
      futureLimit.toISOString()
    );

    // Consulta o secretário Gemini
    const result: AssistantResponse = await processSecretaryInput({
      text: input.text,
      audioBase64,
      audioMimeType: "audio/ogg",
      currentIsoTime: now.toISOString(),
      busySlots,
    });

    const audioTranscription = result.transcribedText
      ? `🎙️ _\"${result.transcribedText}\"_\n\n`
      : "";

    // 1. CONSULTA DE AGENDA
    if (result.intent === "query") {
      await ctx.reply(`${audioTranscription}${result.message}`, {
        parse_mode: "Markdown",
      });
      return;
    }

    // 2. NOVO AGENDAMENTO
    if (result.intent === "schedule") {
      const formattedDate = formatDateBr(result.suggestedStart);

      // Metadados guardados em um link transparente com espaço de largura zero (invisível ao usuário)
      const payload = {
        t: result.title,
        s: result.suggestedStart,
        e: result.suggestedEnd,
        m: result.durationMinutes,
        r: result.rationale,
      };
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");
      const invisibleDataLink = `[​](tg://payload/${encodedPayload})`;

      const messageText =
        `${audioTranscription}📅 **Proposta de Agendamento:**\n\n` +
        `📌 **Item:** ${result.title}\n` +
        `⏰ **Horário Sugerido:** ${formattedDate} (${result.durationMinutes} min)\n\n` +
        `💡 **Justificativa:**\n_${result.rationale}_\n\n` +
        `Ficou bom para você? Toque abaixo para confirmar na sua agenda.${invisibleDataLink}`;

      await ctx.reply(messageText, {
        parse_mode: "Markdown",
        reply_markup: createProposalKeyboard(),
      });
      return;
    }

    // 3. EXCLUSÃO DE COMPROMISSO
    if (result.intent === "delete") {
      if (result.matchingEventId) {
        await deleteGoogleCalendarEvent(result.matchingEventId);
        await ctx.reply(
          `${audioTranscription}🗑️ **Compromisso removido com sucesso!**\n\n` +
            `Removi **${result.targetTitle}** da sua agenda.`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(
          `${audioTranscription}⚠️ Não encontrei nenhum compromisso com o nome **"${result.targetTitle}"** na sua agenda para remover. Verifique se o nome está correto.`,
          { parse_mode: "Markdown" }
        );
      }
      return;
    }

    // 4. CONVERSA GERAL
    if (result.intent === "chat") {
      await ctx.reply(`${audioTranscription}${result.message}`, {
        parse_mode: "Markdown",
      });
      return;
    }
  } catch (error: any) {
    console.error("Erro ao processar mensagem do usuário:", error);
    await ctx.reply(
      `⚠️ Desculpe, tive um problema ao analisar:\n\`${error?.message || error}\`\n\nTente novamente.`
    );
  }
}

bot.on("message:voice", async (ctx) => {
  await handleUserSecretaryInput(ctx, { voiceFileId: ctx.message.voice.file_id });
});

bot.on("message:audio", async (ctx) => {
  await handleUserSecretaryInput(ctx, { voiceFileId: ctx.message.audio.file_id });
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await handleUserSecretaryInput(ctx, { text: ctx.message.text });
});

// Callbacks dos botões
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const rawText = ctx.callbackQuery.message?.text || "";

  if (data === "action:cancel") {
    await ctx.answerCallbackQuery({ text: "Cancelado." });
    await ctx.editMessageText(
      rawText.replace(/Ficou bom para você\?[\s\S]*$/, "❌ **Agendamento cancelado.**"),
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (data === "action:reschedule") {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "🔄 Sem problemas! Mande um áudio ou texto dizendo quando você prefere (ex: _'joga para sexta de manhã'_ ou _'prefiro amanhã às 15h'_)."
    );
    return;
  }

  if (data === "action:confirm") {
    await ctx.answerCallbackQuery({ text: "Agendando..." });

    // Busca o payload codificado no link invisível tg://payload/...
    // Também suporta fallback do formato anterior caso haja mensagem antiga
    const match =
      rawText.match(/tg:\/\/payload\/([A-Za-z0-9+/=]+)/) ||
      rawText.match(/📦 Ref: ([A-Za-z0-9+/=]+)/);

    // Se não encontrou no texto cru, verifica as entities do Telegram
    let encodedData = match ? match[1] : null;
    if (!encodedData && ctx.callbackQuery.message?.entities) {
      for (const ent of ctx.callbackQuery.message.entities) {
        if (ent.type === "text_link" && ent.url?.startsWith("tg://payload/")) {
          encodedData = ent.url.replace("tg://payload/", "");
          break;
        }
      }
    }

    if (!encodedData) {
      await ctx.reply("⚠️ Não consegui recuperar os dados do agendamento. Envie a mensagem novamente.");
      return;
    }

    try {
      const json = Buffer.from(encodedData, "base64").toString("utf-8");
      const payload = JSON.parse(json);

      const result = await createGoogleCalendarEvent({
        title: payload.t,
        startIso: payload.s,
        endIso: payload.e || payload.s,
        description: `💡 Agendado pelo Secretário Executivo:\n${payload.r}`,
      });

      const confirmationDetails =
        `✅ **Confirmado e agendado com sucesso!**\n\n` +
        `📌 **Compromisso:** ${payload.t}\n` +
        `⏰ **Horário:** ${formatDateBr(payload.s)}\n` +
        (result.htmlLink ? `🔗 [Ver no Google Calendar](${result.htmlLink})\n\n` : "\n\n") +
        `🗓️ Já está sincronizado e visível no seu **Notion Calendar**!`;

      await ctx.editMessageText(confirmationDetails, {
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      console.error("Erro ao salvar agendamento:", err);
      await ctx.reply(`⚠️ Erro ao salvar na agenda:\n\`${err?.message || err}\``);
    }
  }
});
