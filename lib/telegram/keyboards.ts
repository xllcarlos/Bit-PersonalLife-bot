import { InlineKeyboard } from "grammy";

export function createProposalKeyboard(
  id: string,
  kind: "create" | "task" | "update" | "delete"
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (kind === "delete") {
    return kb.text("🗑️ Sim, excluir", `a:ok:${id}`).text("❌ Cancelar", `a:no:${id}`);
  }
  const label =
    kind === "create"
      ? "✅ Confirmar no Google"
      : kind === "task"
        ? "✅ Criar no Notion"
        : "✅ Aplicar";
  return kb
    .text(label, `a:ok:${id}`)
    .row()
    .text("🔄 Outro horário", `a:redo:${id}`)
    .text("❌ Cancelar", `a:no:${id}`);
}
