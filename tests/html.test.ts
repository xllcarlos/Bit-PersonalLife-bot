import { describe, expect, it } from "vitest";
import { chunkText, escapeHtml, modelTextToHtml, stripTags } from "../lib/html";

describe("modelTextToHtml", () => {
  it("converte **negrito** e bullets", () => {
    expect(modelTextToHtml("* **09:00** Reunião\n- item")).toBe("• <b>09:00</b> Reunião\n• item");
  });

  it("escapa HTML vindo do modelo ou de títulos de eventos", () => {
    expect(modelTextToHtml("<script>&")).toBe("&lt;script&gt;&amp;");
  });

  it("não quebra com _ e * soltos", () => {
    expect(() => modelTextToHtml("a_b *c")).not.toThrow();
  });
});

describe("helpers", () => {
  it("escapeHtml", () => {
    expect(escapeHtml("<a & b>")).toBe("&lt;a &amp; b&gt;");
  });

  it("stripTags desfaz o HTML", () => {
    expect(stripTags("<b>a</b> &lt;b&gt;")).toBe("a <b>");
  });

  it("chunkText respeita o limite", () => {
    const text = Array.from({ length: 200 }, (_, i) => `linha ${i}`.padEnd(40, "x")).join("\n");
    const chunks = chunkText(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("\n")).toBe(text);
  });
});
