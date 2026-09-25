/**
 * Extractor via OpenRouter (API chat completions yang kompatibel OpenAI), untuk model gratis.
 * Prompt, skema, dan validasi sama dengan jalur Claude; hanya transport-nya yang berbeda.
 * Aktif bila EXTRACTOR=openrouter.
 */
import type { CatalogProduct } from "./catalog";
import {
  buildSystemPrompt,
  buildUserText,
  EXTRACTION_JSON_SCHEMA,
  ExtractionError,
  parseExtractionJson,
  type Extractor,
} from "./order-parser";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Beberapa model dipisah koma: OpenRouter otomatis pindah ke model berikutnya bila yang pertama penuh/error.
export const DEFAULT_OPENROUTER_MODEL = "nex-agi/nex-n2.5-mini:free,dots-studio/dots-3-note-preview:free";

// Tidak semua model gratis patuh pada response_format; instruksi ini jadi jaring pengaman.
const JSON_INSTRUCTION = `

Balas HANYA dengan satu objek JSON (tanpa teks lain, tanpa markdown) dengan bentuk:
{"items": [{"teks_asli": string, "nama": string, "qty": number, "satuan": string|null}], "catatan_pengiriman": string|null}
Nilai satuan harus salah satu dari: sak, m3, rit, batang, kg, biji, lembar, galon, pail, kaleng, dus, bungkus, meter, atau null.`;

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type ChatResponse = {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: number; metadata?: { raw?: string } };
};

export type OpenRouterConfig = {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  /** Jeda sebelum mencoba ulang saat kena rate limit (ms); bisa diperkecil di test. */
  retryDelayMs?: number;
};

/** Ambil objek JSON dari jawaban model (kadang dibungkus ```json atau diawali teks). */
export function extractJsonText(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : content).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createOpenRouterExtractor(catalog: CatalogProduct[], config: OpenRouterConfig = {}): Extractor {
  const apiKey = config.apiKey ?? process.env.OPENROUTER_API_KEY;
  const models = (config.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const model = models[0];
  const fetchFn = config.fetchFn ?? fetch;
  const retryDelayMs = config.retryDelayMs ?? 8_000;
  const system = buildSystemPrompt(catalog) + JSON_INSTRUCTION;

  async function call(body: Record<string, unknown>): Promise<ChatResponse> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "Asisten Pesanan Toko Bangunan",
        },
        body: JSON.stringify(body),
      });
      // Model gratis punya batas per menit; tunggu lalu coba lagi (maks. 2x).
      if (res.status === 429 && attempt < 2) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : retryDelayMs * (attempt + 1));
        continue;
      }
      const data = (await res.json().catch(() => ({}))) as ChatResponse;
      if (!res.ok || data.error) {
        // metadata.raw berisi alasan dari penyedia model (mis. "temporarily rate-limited upstream").
        const msg = data.error?.metadata?.raw ?? data.error?.message ?? res.statusText;
        throw new ExtractionError(`OpenRouter ${res.status}: ${msg}`);
      }
      return data;
    }
  }

  return async (input) => {
    if (!apiKey) throw new ExtractionError("OPENROUTER_API_KEY belum diset");

    const userContent: ContentPart[] = [
      ...(input.images ?? []).map((img) => ({
        type: "image_url" as const,
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
      })),
      { type: "text", text: buildUserText(input) },
    ];
    const base = {
      model,
      ...(models.length > 1 ? { models } : {}),
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    };

    // Coba dulu dengan JSON schema; bila model menolak parameter itu atau jawabannya tidak valid,
    // ulangi sekali tanpa response_format (mengandalkan instruksi JSON di system prompt).
    let data: ChatResponse;
    let text: string;
    try {
      data = await call({
        ...base,
        response_format: {
          type: "json_schema",
          json_schema: { name: "pesanan", strict: true, schema: EXTRACTION_JSON_SCHEMA },
        },
      });
      text = data.choices?.[0]?.message?.content ?? "";
      parseExtractionJson(extractJsonText(text));
    } catch (err) {
      if (err instanceof ExtractionError && /OpenRouter (401|402|403|429)/.test(err.message)) throw err;
      data = await call(base);
      text = data.choices?.[0]?.message?.content ?? "";
    }

    if (data.choices?.[0]?.finish_reason === "length") throw new ExtractionError("Respons model terpotong (length)");
    return {
      extraction: parseExtractionJson(extractJsonText(text)),
      model: data.model ?? model,
      usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
    };
  };
}
