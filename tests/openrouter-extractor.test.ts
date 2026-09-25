import { describe, expect, it, vi } from "vitest";
import { loadCatalogFromFile } from "@/lib/catalog";
import { extractorKind } from "@/lib/extractor";
import { createOpenRouterExtractor, extractJsonText, OPENROUTER_URL } from "@/lib/openrouter-extractor";
import { ExtractionError } from "@/lib/order-parser";

const catalog = loadCatalogFromFile();
const VALID = {
  items: [{ teks_asli: "semen tiga roda 20 sak", nama: "semen tiga roda", qty: 20, satuan: "sak" }],
  catatan_pengiriman: null,
};

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
const chat = (content: string) => ({ model: "qwen/qwen3.8-27b:free", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 60 } });

function setup(...responses: Response[]) {
  const fetchFn = vi.fn<typeof fetch>();
  for (const r of responses) fetchFn.mockResolvedValueOnce(r);
  const extract = createOpenRouterExtractor(catalog, { apiKey: "sk-or-test", model: "qwen/qwen3.8-27b:free", fetchFn, retryDelayMs: 1 });
  const bodies = () => fetchFn.mock.calls.map((c) => JSON.parse(String(c[1]!.body)));
  return { fetchFn, extract, bodies };
}

describe("extractJsonText", () => {
  it("mengambil JSON dari blok ```json dan teks pembuka", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('Berikut hasilnya: {"a":1} semoga membantu')).toBe('{"a":1}');
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
  });
});

describe("createOpenRouterExtractor", () => {
  it("mengirim JSON schema + gambar, lalu mengurai jawabannya", async () => {
    const { extract, fetchFn, bodies } = setup(jsonResponse(200, chat(JSON.stringify(VALID))));
    const r = await extract({ text: "ini daftarnya", images: [{ mediaType: "image/jpeg", base64: "AAAA" }] });

    expect(r.extraction).toEqual(VALID);
    expect(r.usage).toEqual({ input_tokens: 900, output_tokens: 60 });
    expect(fetchFn.mock.calls[0][0]).toBe(OPENROUTER_URL);
    expect((fetchFn.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
    const body = bodies()[0];
    expect(body.model).toBe("qwen/qwen3.8-27b:free");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.messages[1].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
    expect(body.messages[1].content[1]).toEqual({ type: "text", text: "ini daftarnya" });
  });

  it("jawaban dibungkus markdown tetap bisa diurai", async () => {
    const { extract } = setup(jsonResponse(200, chat("```json\n" + JSON.stringify(VALID) + "\n```")));
    expect((await extract({ text: "x" })).extraction).toEqual(VALID);
  });

  it("model menolak response_format → coba ulang tanpa response_format", async () => {
    const { extract, bodies } = setup(
      jsonResponse(400, { error: { message: "response_format not supported", code: 400 } }),
      jsonResponse(200, chat(JSON.stringify(VALID))),
    );
    expect((await extract({ text: "x" })).extraction).toEqual(VALID);
    expect(bodies()[1].response_format).toBeUndefined();
  });

  it("jawaban pertama bukan JSON valid → coba ulang sekali", async () => {
    const { extract, fetchFn } = setup(
      jsonResponse(200, chat("maaf saya tidak paham")),
      jsonResponse(200, chat(JSON.stringify(VALID))),
    );
    expect((await extract({ text: "x" })).extraction).toEqual(VALID);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("429 → menunggu lalu mencoba lagi", async () => {
    const { extract, fetchFn } = setup(
      jsonResponse(429, { error: { message: "rate limited" } }, { "retry-after": "0" }),
      jsonResponse(200, chat(JSON.stringify(VALID))),
    );
    expect((await extract({ text: "x" })).extraction).toEqual(VALID);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("beberapa model (dipisah koma) dikirim sebagai daftar fallback", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, chat(JSON.stringify(VALID))));
    const extract = createOpenRouterExtractor(catalog, { apiKey: "k", model: "a/x:free, b/y:free", fetchFn });
    await extract({ text: "x" });
    const body = JSON.parse(String(fetchFn.mock.calls[0][1]!.body));
    expect(body.model).toBe("a/x:free");
    expect(body.models).toEqual(["a/x:free", "b/y:free"]);
  });

  it("pesan error menampilkan alasan dari penyedia model", async () => {
    const { extract } = setup(
      jsonResponse(403, { error: { message: "Provider returned error", metadata: { raw: "model sedang penuh" } } }),
    );
    await expect(extract({ text: "x" })).rejects.toThrow("OpenRouter 403: model sedang penuh");
  });

  it("key salah (401) → gagal tanpa percobaan ulang", async () => {
    const { extract, fetchFn } = setup(jsonResponse(401, { error: { message: "No auth credentials found", code: 401 } }));
    await expect(extract({ text: "x" })).rejects.toThrow(/OpenRouter 401/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("tanpa API key → ExtractionError", async () => {
    const extract = createOpenRouterExtractor(catalog, { apiKey: "", fetchFn: vi.fn() });
    await expect(extract({ text: "x" })).rejects.toThrow(ExtractionError);
  });
});

describe("extractorKind", () => {
  it("default claude; openrouter & heuristik dikenali", () => {
    expect(extractorKind(undefined)).toBe("claude");
    expect(extractorKind("OpenRouter")).toBe("openrouter");
    expect(extractorKind("heuristik")).toBe("heuristik");
    expect(extractorKind("lain")).toBe("claude");
  });
});
