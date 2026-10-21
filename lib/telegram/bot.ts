import { Bot } from "grammy";
import { config } from "../config";
import {
  analyzeAndScheduleInput,
  ScheduledProposal,
} from "../gemini/scheduler";
import {
  createGoogleCalendarEvent,
  getUpcomingGoogleEvents,
  BusySlot,
} from "../google/calendar";
import { createProposalKeyboard } from "./keyboards";

export const bot = new Bot(config.telegram.botToken || "dummy_token_for_build");

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

  const geminiStatus = config.gemini.apiKey ? "🟢 Conectado" : "🔴 Não configurado";
  const googleStatus = config.google.clientEmail ? "🟢 Conectado" : "🟡 Pendente credenciais";

  await ctx.reply(
    `👋 Olá, Carlos! Sou o seu **Assistente Racional de Rotina**.\n\n` +
      `Eu leio os compromissos reais da sua agenda (sem assumir horários fixos inventados) e encontro a melhor janela para suas novas tarefas e estudos.\n\n` +
      `📊 **Status:**\n` +
      `• Gemini AI: ${geminiStatus}\n` +
      `• Google Calendar: ${googleStatus}\n` +
      `• Janela de Leitura: Próximos ${config.scheduler.lookaheadDays} dias\n\n` +
      `🎙️ **Como usar:**\n` +
      `Mande um **áudio** ou **mensagem de texto** com o que precisa fazer. Exemplos:\n` +
      `_\"Preciso ler o artigo do MICCAI na próxima quinta à tarde, dura 1h30\"_\n` +
      `_\"Tenho que preparar a mentoria dos alunos para a semana que vem\"_\n\n` +
      `Eu calculo o melhor horário sem sobrepor seus compromissos e peço sua confirmação!`,
    { parse_mode: "Markdown" }
  );
});

// /status
bot.command("status", async (ctx) => {
  if (!isAuthorized(ctx.from?.id)) return;
  await ctx.reply(
    `⚙️ **Configurações Atuais:**\n` +
      `• Seu Telegram ID: \`${ctx.from?.id}\`\n` +
      `• Google Calendar ID: \`${config.google.calendarId}\`\n` +
      `• Janela de visualização: ${config.scheduler.lookaheadDays} dias`,
    { parse_mode: "Markdown" }
  );
});

// Process user input (voice or text)
async function handleUserTaskInput(ctx: any, input: { text?: string; voiceFileId?: string }) {
  if (!isAuthorized(ctx.from?.id)) {
    return ctx.reply("⛔ Acesso não autorizado.");
  }

  const statusMsg = await ctx.reply("🧠 Consultando seus compromissos reais e analisando janelas livres...");

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

    // Dynamic horizon: today until lookaheadDays (e.g. 14 days)
    const now = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + config.scheduler.lookaheadDays);

    const busySlots: BusySlot[] = await getUpcomingGoogleEvents(
      now.toISOString(),
      futureLimit.toISOString()
    );

    // Analyze with Gemini
    const proposal = await analyzeAndScheduleInput({
      text: input.text,
      audioBase64,
      audioMimeType: "audio/ogg",
      currentIsoTime: now.toISOString(),
      busySlots,
    });

    const formattedDate = formatDateBr(proposal.suggestedStart);

    // Minimal payload for stateless confirmation
    const payload = {
      t: proposal.title,
      s: proposal.suggestedStart,
      e: proposal.suggestedEnd,
      m: proposal.durationMinutes,
      r: proposal.rationale,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64");

    const messageText =
      `🧠 **Proposta Racional de Encaixe:**\n\n` +
      `📌 **Item:** ${proposal.title}\n` +
      `⏰ **Horário Sugerido:** ${formattedDate} (${proposal.durationMinutes} min)\n` +
      `💡 **Racional do Gemini:**\n_${proposal.rationale}_\n\n` +
      (proposal.transcribedText ? `🎙️ _Transcrição: "${proposal.transcribedText}"_\n\n` : "") +
      `Ficou bom para você? Toque abaixo para confirmar na sua agenda ou sugerir outro horário.\n\n` +
      `📦 Ref: ${encodedPayload}`;

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      messageText,
      {
        parse_mode: "Markdown",
        reply_markup: createProposalKeyboard(),
      }
    );
  } catch (error: any) {
    console.error("Erro ao processar mensagem do usuário:", error);
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `⚠️ Desculpe, tive um problema ao analisar:\n\`${error?.message || error}\`\n\nTente novamente ou verifique as credenciais.`
    );
  }
}

bot.on("message:voice", async (ctx) => {
  await handleUserTaskInput(ctx, { voiceFileId: ctx.message.voice.file_id });
});

bot.on("message:audio", async (ctx) => {
  await handleUserTaskInput(ctx, { voiceFileId: ctx.message.audio.file_id });
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await handleUserTaskInput(ctx, { text: ctx.message.text });
});

bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const messageText = ctx.callbackQuery.message?.text || "";

  if (data === "action:cancel") {
    await ctx.answerCallbackQuery({ text: "Cancelado." });
    await ctx.editMessageText(
      messageText.replace(/Ficou bom para você\?[\s\S]*$/, "❌ **Agendamento cancelado.**"),
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (data === "action:reschedule") {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "🔄 Sem problemas! Mande um áudio ou texto dizendo a sua preferência de dia/horário (ex: _'joga para a próxima sexta de manhã'_ ou _'prefiro quarta depois das 16h'_)."
    );
    return;
  }

  if (data === "action:confirm") {
    await ctx.answerCallbackQuery({ text: "Criando evento..." });

    const match = messageText.match(/📦 Ref: ([A-Za-z0-9+/=]+)/);
    if (!match) {
      await ctx.reply("⚠️ Dados da proposta não encontrados. Envie a mensagem novamente.");
      return;
    }

    try {
      const json = Buffer.from(match[1], "base64").toString("utf-8");
      const payload = JSON.parse(json);

      const result = await createGoogleCalendarEvent({
        title: payload.t,
        startIso: payload.s,
        endIso: payload.e || payload.s,
        description: `💡 Planejado pelo Assistente Racional:\n${payload.r}`,
      });

      const confirmationDetails =
        `✅ **Sucesso! Criado no Google Agenda.**\n\n` +
        `📌 **Item:** ${payload.t}\n` +
        `⏰ **Horário:** ${formatDateBr(payload.s)}\n` +
        (result.htmlLink ? `🔗 [Abrir no Google Calendar](${result.htmlLink})\n\n` : "\n\n") +
        `🗓️ Já sincronizado no seu **Notion Calendar**, pronto para você visualizar ou arrastar se necessário!`;

      await ctx.editMessageText(confirmationDetails, {
        parse_mode: "Markdown",
      });
    } catch (err: any) {
      console.error("Erro ao salvar agendamento:", err);
      await ctx.reply(`⚠️ Erro ao salvar agendamento:\n\`${err?.message || err}\``);
    }
  }
});
