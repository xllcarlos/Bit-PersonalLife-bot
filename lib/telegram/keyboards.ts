import { InlineKeyboard } from "grammy";

export function createProposalKeyboard(
  id: string,
  kind: "create" | "update" | "delete"
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (kind === "delete") {
    return kb.text("🗑️ Sim, excluir", `a:ok:${id}`).text("❌ Cancelar", `a:no:${id}`);
  }
  return kb
    .text(kind === "create" ? "✅ Confirmar" : "✅ Aplicar", `a:ok:${id}`)
    .row()
    .text("🔄 Outro horário", `a:redo:${id}`)
    .text("❌ Cancelar", `a:no:${id}`);
}
