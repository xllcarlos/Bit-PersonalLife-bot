/** Escapa texto para uso seguro com parse_mode "HTML" do Telegram. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Converte o texto simples do Gemini (com **negrito** e bullets "* ") em HTML do Telegram.
 * Todo o resto é escapado, então nada que o modelo escreva quebra a mensagem.
 */
export function modelTextToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>");
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Divide textos longos em pedaços que cabem no limite de 4096 caracteres do Telegram. */
export function chunkText(text: string, max = 3500): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > max && current) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) chunks.push(current);
  return chunks;
}
