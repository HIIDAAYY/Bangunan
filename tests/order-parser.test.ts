import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { loadCatalogFromFile } from "@/lib/catalog";
import {
  buildSystemPrompt,
  buildUserContent,
  createClaudeExtractor,
  EXTRACTION_JSON_SCHEMA,
  ExtractionError,
  parseExtractionJson,
} from "@/lib/order-parser";

const catalog = loadCatalogFromFile();

const VALID = {
  items: [{ teks_asli: "semen tiga roda 20 sak", nama: "semen tiga roda", qty: 20, satuan: "sak" }],
  catatan_pengiriman: "jl. melati 5",
};

/** Client tiruan: hanya beta.messages.create yang dipakai extractor. */
function fakeClient(response: Partial<Anthropic.Beta.BetaMessage>) {
  const create = vi.fn().mockResolvedValue({
    model: "claude-opus-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
    content: [],
    ...response,
  });
  return { client: { beta: { messages: { create } } } as unknown as Anthropic, create };
}

describe("parseExtractionJson", () => {
  it("menerima JSON yang sesuai skema", () => {
    expect(parseExtractionJson(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("menolak JSON rusak", () => {
    expect(() => parseExtractionJson("{items:")).toThrow(ExtractionError);
  });

  it("menolak qty non-positif dan satuan di luar daftar", () => {
    const badQty = { ...VALID, items: [{ ...VALID.items[0], qty: 0 }] };
    const badUnit = { ...VALID, items: [{ ...VALID.items[0], satuan: "colt" }] };
    expect(() => parseExtractionJson(JSON.stringify(badQty))).toThrow(ExtractionError);
    expect(() => parseExtractionJson(JSON.stringify(badUnit))).toThrow(ExtractionError);
  });
});

describe("prompt", () => {
  it("system prompt memuat semua produk katalog", () => {
    const prompt = buildSystemPrompt(catalog);
    for (const p of catalog) expect(prompt).toContain(p.nama);
  });

  it("JSON schema strict: semua properti required & tanpa properti tambahan", () => {
    const item = EXTRACTION_JSON_SCHEMA.properties.items.items;
    expect(item.required).toEqual(Object.keys(item.properties));
    expect(item.additionalProperties).toBe(false);
    expect(EXTRACTION_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it("foto dikirim sebagai blok image sebelum teks", () => {
    const content = buildUserContent({ text: "ini daftarnya", images: [{ mediaType: "image/jpeg", base64: "AAAA" }] });
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
  });

  it("mode revisi menyertakan pesanan saat ini", () => {
    const [block] = buildUserContent({
      text: "semen jadi 30",
      currentOrder: { lines: [{ nama: "Semen Tiga Roda 50kg", qty: 20, satuan: "sak" }], catatanPengiriman: null },
    });
    expect(block.type === "text" && block.text).toContain("Semen Tiga Roda 50kg: 20 sak");
    expect(block.type === "text" && block.text).toContain("semen jadi 30");
  });
});

describe("createClaudeExtractor", () => {
  it("memanggil API dengan structured output + fallback dan mengurai hasilnya", async () => {
    const { client, create } = fakeClient({ content: [{ type: "text", text: JSON.stringify(VALID), citations: null }] });
    const extract = createClaudeExtractor(catalog, { client, model: "claude-opus-5", effort: "medium" });

    const result = await extract({ text: "semen tiga roda 20 sak kirim ke jl melati 5" });

    expect(result.extraction).toEqual(VALID);
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.output_config).toEqual({ effort: "medium", format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA } });
  });

  it("stop_reason refusal → ExtractionError", async () => {
    const { client } = fakeClient({ stop_reason: "refusal", content: [] });
    const extract = createClaudeExtractor(catalog, { client });
    await expect(extract({ text: "x" })).rejects.toThrow(ExtractionError);
  });

  it("stop_reason max_tokens → ExtractionError", async () => {
    const { client } = fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"items": [', citations: null }] });
    const extract = createClaudeExtractor(catalog, { client });
    await expect(extract({ text: "x" })).rejects.toThrow(/terpotong/);
  });
});
