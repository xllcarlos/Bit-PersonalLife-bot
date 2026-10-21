import { InlineKeyboard } from "grammy";

export function createProposalKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Confirmar na Agenda", "action:confirm")
    .row()
    .text("🔄 Outro Horário", "action:reschedule")
    .text("❌ Cancelar", "action:cancel");
}
