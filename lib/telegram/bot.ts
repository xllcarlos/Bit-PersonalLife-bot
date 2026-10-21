import { Bot, Context } from "grammy";
import { config, getMissingEnv } from "../config";
import { processSecretaryInput } from "../gemini/secretary";
import {
  CalendarEvent,
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
} from "../google/calendar";
import { escapeHtml as e, modelTextToHtml, stripTags, chunkText } from "../html";
import {
  addDaysIso,
  formatDateBr,
  formatDayBr,
  formatRangeBr,
  overlaps,
  startOfDayIso,
  toLocalIso,
} from "../time";
import {
  clearContext,
  getContext,
  isPersistent,
  markUpdateSeen,
  savePending,
  saveContext,
  takePending,
} from "../store";
import type { PendingAction } from "../types";
import { createProposalKeyboard } from "./keyboards";

// Os envios ao Telegram são feitos via API (não na resposta HTTP do webhook), para que
// terminem antes de a função serverless ser encerrada.
export const bot = new Bot(config.telegram.botToken || "dummy_token_for_build", {
  client: { canUseWebhookReply: () => false },
});

// ───────────── Segurança: só o dono usa o bot (negado por padrão) ─────────────

function isAuthorized(userId?: number): boolean {
  return !!config.telegram.allowedUserId && String(userId) === config.telegram.allowedUserId;
}

bot.use(async (ctx, next) => {
  if (isAuthorized(ctx.from?.id)) return next();

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "Não autorizado." });
  } else if (ctx.chat?.type === "private") {
    await ctx.reply(
      config.telegram.allowedUserId
        ? "⛔ Acesso não autorizado."
        : `⛔ Bot ainda não configurado. Defina ALLOWED_TELEGRAM_USER_ID=${ctx.from?.id} na Vercel e faça um redeploy.`
    );
  }
});

// Telegram reenvia updates quando demora a responder; processar duas vezes duplicaria eventos.
bot.use(async (ctx, next) => {
  if (await markUpdateSeen(ctx.update.update_id)) await next();
});

// ───────────── Helpers de envio ─────────────

async function replyHtml(
  ctx: Context,
  html: string,
  extra: Parameters<Context["reply"]>[1] = {}
): Promise<void> {
  const chunks = chunkText(html);
  for (let i = 0; i < chunks.length; i++) {
    const options = i === chunks.length - 1 ? extra : {};
    try {
      await ctx.reply(chunks[i], { ...options, parse_mode: "HTML" });
    } catch (err) {
      console.warn("Falha com HTML, reenviando como texto simples:", err);
      await ctx.reply(stripTags(chunks[i]), options);
    }
  }
}

async function editHtml(ctx: Context, html: string): Promise<void> {
  try {
    await ctx.editMessageText(html, { parse_mode: "HTML" });
  } catch (err) {
    console.warn("Falha ao editar mensagem:", err);
    await replyHtml(ctx, html);
  }
}

function errorHtml(prefix: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `⚠️ ${e(prefix)}\n<code>${e(message.slice(0, 300))}</code>`;
}

function transcriptionHtml(text?: string | null): string {
  return text ? `🎙️ <i>"${e(text)}"</i>\n\n` : "";
}

function describeEventTime(ev: CalendarEvent): string {
  return ev.allDay
    ? ev.start === ev.end
      ? `${formatDayBr(ev.start)} (dia inteiro)`
      : `${formatDayBr(ev.start)} a ${formatDayBr(ev.end)} (dia inteiro)`
    : formatRangeBr(ev.start, ev.end);
}

// ───────────── Comandos ─────────────

bot.command("start", async (ctx) => {
  const missing = getMissingEnv();
  const warnings: string[] = [];
  if (missing.length) warnings.push(`⚠️ Variáveis ausentes: <code>${missing.join(", ")}</code>`);
  if (!isPersistent()) {
    warnings.push(
      "⚠️ Redis não configurado: os botões de confirmação podem falhar na Vercel (veja o README)."
    );
  }

  await replyHtml(
    ctx,
    `👋 Olá, Carlos! Sou o seu <b>secretário de agenda</b>.\n\n` +
      `Pode falar ou escrever. Por exemplo:\n` +
      `• "Como está a minha agenda hoje?"\n` +
      `• "O que eu tenho amanhã?"\n` +
      `• "Preciso ler o artigo do MICCAI na quinta à tarde, 1h30"\n` +
      `• "Muda a reunião de sexta para as 15h"\n` +
      `• "Desmarca a reunião de amanhã"\n\n` +
      `Comandos: /agenda (hoje e próximos dias)` +
      (warnings.length ? `\n\n${warnings.join("\n")}` : "")
  );
});

bot.command("agenda", async (ctx) => {
  await handleInput(ctx, { text: "Como está a minha agenda hoje e nos próximos dias?" });
});

// ───────────── Núcleo: interpretar a mensagem e responder ─────────────

interface Input {
  text?: string;
  voiceFileId?: string;
  mimeType?: string;
}

async function downloadAudio(ctx: Context, fileId: string): Promise<string> {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) throw new Error("Não consegui baixar o áudio.");
  if (file.file_size && file.file_size > 10 * 1024 * 1024) {
    throw new Error("Áudio muito grande (limite de 10 MB).");
  }
  const res = await fetch(`https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`);
  if (!res.ok) throw new Error(`Falha ao baixar o áudio (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

async function handleInput(ctx: Context, input: Input): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    await ctx.replyWithChatAction(input.voiceFileId ? "record_voice" : "typing");

    const audioBase64 = input.voiceFileId ? await downloadAudio(ctx, input.voiceFileId) : undefined;

    // A janela começa à 00:00 de hoje (fuso de SP): eventos que já passaram hoje continuam na agenda.
    const now = new Date();
    const timeMin = startOfDayIso(now);
    const timeMax = addDaysIso(timeMin, config.scheduler.lookaheadDays);

    const [events, pendingContext] = await Promise.all([
      listEvents(timeMin, timeMax),
      getContext(chatId),
    ]);

    const result = await processSecretaryInput({
      text: input.text,
      audioBase64,
      audioMimeType: input.mimeType || "audio/ogg",
      now,
      events,
      pendingContext,
    });

    const heard = transcriptionHtml(result.transcribedText);

    switch (result.intent) {
      case "query":
      case "chat":
        await replyHtml(ctx, heard + modelTextToHtml(result.message));
        return;

      case "schedule": {
        const conflicts = events.filter(
          (ev) => !ev.allDay && overlaps(result.start, result.end, ev.start, ev.end)
        );
        const warnings: string[] = [];
        if (Date.parse(result.start) < Date.now()) warnings.push("⚠️ Esse horário já passou.");
        for (const c of conflicts) {
          warnings.push(`⚠️ Conflita com <b>${e(c.title)}</b> (${e(formatRangeBr(c.start, c.end))})`);
        }

        const action: PendingAction = {
          kind: "create",
          title: result.title,
          start: result.start,
          end: result.end,
          rationale: result.rationale ?? "",
        };
        const id = await savePending(action);
        await saveContext(
          chatId,
          `Criar "${result.title}" em ${formatRangeBr(result.start, result.end)} (aguardando confirmação)`
        );

        await replyHtml(
          ctx,
          `${heard}📅 <b>Proposta de agendamento</b>\n\n` +
            `📌 <b>${e(result.title)}</b>\n` +
            `⏰ ${e(formatRangeBr(result.start, result.end))}\n` +
            (warnings.length ? `\n${warnings.join("\n")}\n` : "") +
            (result.rationale ? `\n💡 <i>${e(result.rationale)}</i>\n` : "") +
            `\nFicou bom?`,
          { reply_markup: createProposalKeyboard(id, "create") }
        );
        return;
      }

      case "update": {
        // O id vem do modelo, mas o evento é sempre conferido na agenda real.
        const target = events.find((ev) => ev.id === result.eventId);
        if (!target) {
          await replyHtml(ctx, `${heard}🤔 Não achei esse compromisso na sua agenda. Qual deles você quer alterar?`);
          return;
        }
        if (!target.writable) {
          await replyHtml(ctx, `${heard}🔒 <b>${e(target.title)}</b> está numa agenda somente leitura; não posso alterá-lo.`);
          return;
        }
        let { start, end } = result;
        if (target.allDay && (start || end)) {
          await replyHtml(ctx, `${heard}📆 <b>${e(target.title)}</b> é de dia inteiro; ajuste a data direto no calendário.`);
          return;
        }
        if (start && !end) {
          const duration = Date.parse(target.end) - Date.parse(target.start);
          end = toLocalIso(new Date(Date.parse(start) + duration));
        }
        if (!result.title && !start && !end) {
          await replyHtml(ctx, `${heard}🤔 O que você quer mudar em <b>${e(target.title)}</b>?`);
          return;
        }

        const action: PendingAction = {
          kind: "update",
          eventId: target.id,
          calendarId: target.calendarId,
          currentTitle: target.title,
          title: result.title ?? undefined,
          start: start ?? undefined,
          end: end ?? undefined,
        };
        const id = await savePending(action);
        await saveContext(
          chatId,
          `Alterar "${target.title}" (${describeEventTime(target)})` +
            (start && end ? ` para ${formatRangeBr(start, end)}` : "") +
            (result.title ? ` e renomear para "${result.title}"` : "") +
            " (aguardando confirmação)"
        );

        await replyHtml(
          ctx,
          `${heard}✏️ <b>Proposta de alteração</b>\n\n` +
            `📌 <b>${e(target.title)}</b>\n` +
            `Agora: ${e(describeEventTime(target))}\n` +
            (start && end ? `Novo: ${e(formatRangeBr(start, end))}\n` : "") +
            (result.title ? `Novo título: <b>${e(result.title)}</b>\n` : "") +
            `\nAplicar?`,
          { reply_markup: createProposalKeyboard(id, "update") }
        );
        return;
      }

      case "delete": {
        const target = events.find((ev) => ev.id === result.eventId);
        if (!target) {
          await replyHtml(ctx, `${heard}🤔 Não achei esse compromisso na sua agenda. Qual deles você quer excluir?`);
          return;
        }
        if (!target.writable) {
          await replyHtml(ctx, `${heard}🔒 <b>${e(target.title)}</b> está numa agenda somente leitura; não posso excluí-lo.`);
          return;
        }
        const id = await savePending({
          kind: "delete",
          eventId: target.id,
          calendarId: target.calendarId,
          title: target.title,
        });
        await replyHtml(
          ctx,
          `${heard}🗑️ <b>Excluir este compromisso?</b>\n\n` +
            `📌 <b>${e(target.title)}</b>\n⏰ ${e(describeEventTime(target))}`,
          { reply_markup: createProposalKeyboard(id, "delete") }
        );
        return;
      }
    }
  } catch (err) {
    console.error("Erro ao processar mensagem:", err);
    await replyHtml(ctx, errorHtml("Tive um problema ao processar seu pedido.", err));
  }
}

bot.on("message:voice", (ctx) =>
  handleInput(ctx, {
    voiceFileId: ctx.message.voice.file_id,
    mimeType: ctx.message.voice.mime_type,
  })
);

bot.on("message:audio", (ctx) =>
  handleInput(ctx, {
    voiceFileId: ctx.message.audio.file_id,
    mimeType: ctx.message.audio.mime_type,
  })
);

bot.on("message:text", (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  return handleInput(ctx, { text: ctx.message.text });
});

// ───────────── Botões (confirmar / outro horário / cancelar) ─────────────

async function execute(action: PendingAction): Promise<string> {
  switch (action.kind) {
    case "create": {
      const created = await createEvent({
        title: action.title,
        startIso: action.start,
        endIso: action.end,
        description: action.rationale ? `Agendado pelo secretário:\n${action.rationale}` : undefined,
      });
      return (
        `✅ <b>Agendado!</b>\n\n📌 <b>${e(action.title)}</b>\n⏰ ${e(formatRangeBr(action.start, action.end))}` +
        (created.htmlLink ? `\n🔗 <a href="${e(created.htmlLink)}">Abrir no Google Calendar</a>` : "")
      );
    }
    case "update": {
      await updateEvent({
        calendarId: action.calendarId,
        eventId: action.eventId,
        title: action.title,
        startIso: action.start,
        endIso: action.end,
      });
      return (
        `✅ <b>Compromisso atualizado!</b>\n\n📌 <b>${e(action.title ?? action.currentTitle)}</b>` +
        (action.start && action.end ? `\n⏰ ${e(formatRangeBr(action.start, action.end))}` : "")
      );
    }
    case "delete": {
      await deleteEvent(action.calendarId, action.eventId);
      return `🗑️ <b>Excluído:</b> ${e(action.title)}`;
    }
  }
}

bot.callbackQuery(/^a:(ok|no|redo):([a-f0-9]+)$/, async (ctx) => {
  const [, verb, id] = ctx.match as unknown as [string, string, string];
  const chatId = ctx.chat?.id;

  const action = await takePending(id);
  if (!action) {
    await ctx.answerCallbackQuery({
      text: "Essa proposta expirou ou já foi usada. Peça de novo.",
      show_alert: true,
    });
    return;
  }

  if (verb === "no") {
    await ctx.answerCallbackQuery({ text: "Cancelado." });
    if (chatId) await clearContext(chatId);
    await editHtml(ctx, "❌ Cancelado.");
    return;
  }

  if (verb === "redo") {
    await ctx.answerCallbackQuery();
    await editHtml(ctx, "🔄 Proposta descartada. Me diga quando prefere (ex: <i>\"sexta de manhã\"</i> ou <i>\"amanhã depois das 15h\"</i>).");
    return; // o contexto da proposta continua guardado para a próxima mensagem
  }

  await ctx.answerCallbackQuery({ text: "Executando..." });
  try {
    const message = await execute(action);
    if (chatId) await clearContext(chatId);
    await editHtml(ctx, message);
  } catch (err) {
    console.error("Erro ao executar ação:", err);
    await savePending(action, id); // permite tentar de novo pelo mesmo botão
    await replyHtml(ctx, errorHtml("Não consegui concluir. Toque no botão para tentar de novo.", err), {
      reply_markup: createProposalKeyboard(id, action.kind),
    });
  }
});
