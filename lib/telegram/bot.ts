import { Bot, Context } from "grammy";
import { config, getMissingEnv } from "../config";
import { processSecretaryInput, diagnoseGeminiModels } from "../gemini/secretary";
import {
  CalendarEvent,
  createEvent,
  deleteEvent,
  diagnoseGoogle,
  updateEvent,
} from "../google/calendar";
import {
  archiveTask,
  createTask,
  diagnoseNotion,
  isNotionConfigured,
  updateTask,
} from "../notion/tasks";
import { loadAgenda } from "../agenda";
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

function formatDeadline(start: string, end?: string | null): string {
  if (!start.includes("T")) {
    return end && end !== start
      ? `${formatDayBr(start)} a ${formatDayBr(end)}`
      : formatDayBr(start);
  }
  return end ? formatRangeBr(start, end) : formatDateBr(start);
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
  const notionStatus = isNotionConfigured()
    ? `🟢 Notion conectado (colunas: <code>${e(config.notion.titleProperty)}</code> e <code>${e(config.notion.dateProperty)}</code>)`
    : `⚪ Notion ainda não configurado (defina <code>NOTION_API_KEY</code> e <code>NOTION_TASK_DATABASE_ID</code>)`;

  await replyHtml(
    ctx,
    `👋 Olá, Carlos! Sou o seu <b>secretário de agenda</b>.\n\n` +
      `${notionStatus}\n\n` +
      `Pode falar ou escrever. Por exemplo:\n` +
      `• "Como está a minha agenda hoje?"\n` +
      `• "O que eu tenho amanhã?"\n` +
      `• "Preciso ler o artigo do MICCAI na quinta à tarde, 1h30"\n` +
      `• "Adiciona tarefa: Texto Professor para até sexta"\n` +
      `• "Muda a reunião de sexta para as 15h"\n` +
      `• "Desmarca a reunião de amanhã"\n\n` +
      `Comandos: /agenda (hoje e próximos dias)` +
      (warnings.length ? `\n\n${warnings.join("\n")}` : "")
  );
});

bot.command("agenda", async (ctx) => {
  await handleInput(ctx, { text: "Como está a minha agenda hoje e nos próximos dias?" });
});

bot.command("debug", async (ctx) => {
  await ctx.replyWithChatAction("typing");
  const now = new Date();
  const timeMin = startOfDayIso(now);
  const timeMax = addDaysIso(timeMin, config.scheduler.lookaheadDays);

  const [googleReport, notionReport, geminiReport] = await Promise.all([
    diagnoseGoogle(timeMin, timeMax),
    diagnoseNotion(),
    diagnoseGeminiModels(),
  ]);

  const text =
    `🔍 <b>Diagnóstico de Conexões</b>\n\n` +
    `<b>🤖 Gemini:</b>\n` +
    geminiReport.map(e).join("\n") +
    `\n\n<b>📅 Google Calendar:</b>\n` +
    googleReport.map(e).join("\n") +
    `\n\n<b>📝 Notion:</b>\n` +
    notionReport.map(e).join("\n");

  await replyHtml(ctx, text);
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

    const now = new Date();
    const timeMin = startOfDayIso(now);
    const timeMax = addDaysIso(timeMin, config.scheduler.lookaheadDays);

    const [{ events, warnings: agendaWarnings }, pendingContext] = await Promise.all([
      loadAgenda(timeMin, timeMax),
      getContext(chatId),
    ]);

    const result = await processSecretaryInput({
      text: input.text,
      audioBase64,
      audioMimeType: input.mimeType || "audio/ogg",
      now,
      events,
      pendingContext,
      notionEnabled: isNotionConfigured(),
    });

    const heard = transcriptionHtml(result.transcribedText);
    const warnBanner = agendaWarnings.length
      ? `⚠️ <i>${agendaWarnings.map(e).join(" ")}</i>\n\n`
      : "";

    switch (result.intent) {
      case "query":
      case "chat":
        await replyHtml(ctx, heard + warnBanner + modelTextToHtml(result.message));
        return;

      case "schedule": {
        const conflicts = events.filter(
          (ev) => !ev.allDay && !ev.done && overlaps(result.start, result.end, ev.start, ev.end)
        );
        const warnings: string[] = [...agendaWarnings.map((w) => `⚠️ ${e(w)}`)];
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
          `Criar compromisso no Google "${result.title}" em ${formatRangeBr(result.start, result.end)} (aguardando confirmação)`
        );

        await replyHtml(
          ctx,
          `${heard}📅 <b>Proposta de compromisso (Google Calendar)</b>\n\n` +
            `📌 <b>${e(result.title)}</b>\n` +
            `⏰ ${e(formatRangeBr(result.start, result.end))}\n` +
            (warnings.length ? `\n${warnings.join("\n")}\n` : "") +
            (result.rationale ? `\n💡 <i>${e(result.rationale)}</i>\n` : "") +
            `\nFicou bom?`,
          { reply_markup: createProposalKeyboard(id, "create") }
        );
        return;
      }

      case "task": {
        if (!isNotionConfigured()) {
          await replyHtml(
            ctx,
            `${heard}⚠️ O Notion ainda não está configurado. Defina <code>NOTION_API_KEY</code> e <code>NOTION_TASK_DATABASE_ID</code> na Vercel.`
          );
          return;
        }

        const warnings: string[] = [...agendaWarnings.map((w) => `⚠️ ${e(w)}`)];
        if (result.start.includes("T") && result.end) {
          const conflicts = events.filter(
            (ev) => !ev.allDay && !ev.done && overlaps(result.start, result.end!, ev.start, ev.end)
          );
          for (const c of conflicts) {
            warnings.push(`⚠️ Conflita com <b>${e(c.title)}</b> (${e(formatRangeBr(c.start, c.end))})`);
          }
        }

        const action: PendingAction = {
          kind: "task",
          title: result.title,
          start: result.start,
          end: result.end ?? undefined,
        };
        const id = await savePending(action);
        const deadlineStr = formatDeadline(result.start, result.end);
        await saveContext(
          chatId,
          `Criar tarefa no Notion "${result.title}" com prazo ${deadlineStr} (aguardando confirmação)`
        );

        await replyHtml(
          ctx,
          `${heard}📝 <b>Proposta de tarefa (Notion)</b>\n\n` +
            `📌 <b>${e(result.title)}</b>\n` +
            `📆 Prazo: ${e(deadlineStr)}\n` +
            (warnings.length ? `\n${warnings.join("\n")}\n` : "") +
            `\nCriar na sua tabela de tarefas?`,
          { reply_markup: createProposalKeyboard(id, "task") }
        );
        return;
      }

      case "update": {
        const target = events.find((ev) => ev.id === result.eventId);
        if (!target) {
          await replyHtml(ctx, `${heard}🤔 Não achei esse item na sua agenda. Qual deles você quer alterar?`);
          return;
        }
        if (!target.writable) {
          await replyHtml(ctx, `${heard}🔒 <b>${e(target.title)}</b> está numa agenda somente leitura; não posso alterá-lo.`);
          return;
        }
        let { start, end } = result;
        if (target.source === "google" && target.allDay && (start || end)) {
          await replyHtml(ctx, `${heard}📆 <b>${e(target.title)}</b> é de dia inteiro no Google; ajuste a data direto no calendário.`);
          return;
        }
        if (start && !end && start.includes("T") && !target.allDay) {
          const duration = Date.parse(target.end) - Date.parse(target.start);
          end = toLocalIso(new Date(Date.parse(start) + duration));
        }
        if (!result.title && !start && !end) {
          await replyHtml(ctx, `${heard}🤔 O que você quer mudar em <b>${e(target.title)}</b>?`);
          return;
        }

        const action: PendingAction = {
          kind: "update",
          source: target.source,
          eventId: target.id,
          calendarId: target.calendarId,
          currentTitle: target.title,
          title: result.title ?? undefined,
          start: start ?? undefined,
          end: end ?? undefined,
        };
        const id = await savePending(action);
        const newTimeLabel = start ? formatDeadline(start, end) : undefined;
        await saveContext(
          chatId,
          `Alterar "${target.title}" (${describeEventTime(target)})` +
            (newTimeLabel ? ` para ${newTimeLabel}` : "") +
            (result.title ? ` e renomear para "${result.title}"` : "") +
            " (aguardando confirmação)"
        );

        await replyHtml(
          ctx,
          `${heard}✏️ <b>Proposta de alteração (${target.source === "notion" ? "Notion" : "Google"})</b>\n\n` +
            `📌 <b>${e(target.title)}</b>\n` +
            `Agora: ${e(describeEventTime(target))}\n` +
            (newTimeLabel ? `Novo: ${e(newTimeLabel)}\n` : "") +
            (result.title ? `Novo título: <b>${e(result.title)}</b>\n` : "") +
            `\nAplicar?`,
          { reply_markup: createProposalKeyboard(id, "update") }
        );
        return;
      }

      case "delete": {
        const target = events.find((ev) => ev.id === result.eventId);
        if (!target) {
          await replyHtml(ctx, `${heard}🤔 Não achei esse item na sua agenda. Qual deles você quer excluir?`);
          return;
        }
        if (!target.writable) {
          await replyHtml(ctx, `${heard}🔒 <b>${e(target.title)}</b> está numa agenda somente leitura; não posso excluí-lo.`);
          return;
        }
        const id = await savePending({
          kind: "delete",
          source: target.source,
          eventId: target.id,
          calendarId: target.calendarId,
          title: target.title,
        });
        await replyHtml(
          ctx,
          `${heard}🗑️ <b>Excluir ${target.source === "notion" ? "esta tarefa do Notion" : "este compromisso"}?</b>\n\n` +
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
        `✅ <b>Agendado no Google Calendar!</b>\n\n📌 <b>${e(action.title)}</b>\n⏰ ${e(formatRangeBr(action.start, action.end))}` +
        (created.htmlLink ? `\n🔗 <a href="${e(created.htmlLink)}">Abrir no Google Calendar</a>` : "")
      );
    }
    case "task": {
      const created = await createTask({
        title: action.title,
        start: action.start,
        end: action.end,
      });
      return (
        `✅ <b>Tarefa criada no Notion!</b>\n\n` +
        `📌 <b>${e(action.title)}</b>\n` +
        `📆 Prazo: ${e(formatDeadline(action.start, action.end))}` +
        (created.url ? `\n🔗 <a href="${e(created.url)}">Abrir no Notion</a>` : "")
      );
    }
    case "update": {
      if (action.source === "notion") {
        await updateTask({
          pageId: action.eventId,
          title: action.title,
          start: action.start,
          end: action.end,
        });
      } else {
        await updateEvent({
          calendarId: action.calendarId,
          eventId: action.eventId,
          title: action.title,
          startIso: action.start,
          endIso: action.end,
        });
      }
      return (
        `✅ <b>Atualizado!</b>\n\n📌 <b>${e(action.title ?? action.currentTitle)}</b>` +
        (action.start ? `\n⏰ ${e(formatDeadline(action.start, action.end))}` : "")
      );
    }
    case "delete": {
      if (action.source === "notion") {
        await archiveTask(action.eventId);
      } else {
        await deleteEvent(action.calendarId, action.eventId);
      }
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
    return;
  }

  await ctx.answerCallbackQuery({ text: "Executando..." });
  try {
    const message = await execute(action);
    if (chatId) await clearContext(chatId);
    await editHtml(ctx, message);
  } catch (err) {
    console.error("Erro ao executar ação:", err);
    await savePending(action, id);
    await replyHtml(ctx, errorHtml("Não consegui concluir. Toque no botão para tentar de novo.", err), {
      reply_markup: createProposalKeyboard(id, action.kind),
    });
  }
});
