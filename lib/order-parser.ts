/**
 * Ekstraksi pesanan dari chat/foto memakai Claude (structured output).
 * Claude hanya menormalkan teks → {nama, qty, satuan}; pencocokan ke SKU dilakukan
 * catalog-matcher agar deterministik dan bisa dites tanpa API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CatalogProduct } from "./catalog";
import type { ExtractedItem } from "./catalog-matcher";

export const SATUAN = [
  "sak", "m3", "rit", "batang", "kg", "biji", "lembar", "galon", "pail", "kaleng", "dus", "bungkus", "meter",
] as const;

export const ExtractionSchema = z.object({
  items: z.array(
    z.object({
      teks_asli: z.string(),
      nama: z.string().min(1),
      qty: z.number().positive(),
      satuan: z.enum(SATUAN).nullable(),
    }),
  ),
  catatan_pengiriman: z.string().nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

/** JSON Schema untuk output_config.format (structured outputs). */
export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teks_asli: { type: "string", description: "Potongan pesan asli untuk item ini" },
          nama: { type: "string", description: "Nama barang yang sudah dinormalkan, tanpa jumlah & satuan jual" },
          qty: { type: "number", description: "Jumlah dalam satuan jual" },
          satuan: { anyOf: [{ type: "string", enum: [...SATUAN] }, { type: "null" }] },
        },
        required: ["teks_asli", "nama", "qty", "satuan"],
        additionalProperties: false,
      },
    },
    catatan_pengiriman: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["items", "catatan_pengiriman"],
  additionalProperties: false,
} as const;

export function buildSystemPrompt(catalog: CatalogProduct[]): string {
  const daftar = catalog.map((p) => `- ${p.nama} [${p.satuan}] — sebutan: ${p.alias.join(", ")}`).join("\n");
  return `Kamu mengekstrak pesanan dari chat WhatsApp pelanggan toko bahan bangunan di Jabodetabek.
Pelanggan biasanya tukang/mandor: bahasanya singkat, banyak typo, kadang campur Jawa/Sunda/Betawi.

Kembalikan setiap barang yang dipesan:
- nama: nama barang dalam bahasa Indonesia baku yang ringkas. Perbaiki typo dan terjemahkan kata daerah
  (mis. "pacul" boleh tetap "pacul", "pitu setengah" → "7.5", "bt merah" → "bata merah").
  Pertahankan SEMUA spesifikasi yang ditulis pelanggan (merek, ukuran, tebal, tipe, mis. "besi 10 banci",
  "semen tiga roda 40 kg", "cat catylac 25 kg"). JANGAN menambah spesifikasi yang tidak ditulis:
  kalau pelanggan hanya menulis "hebel" atau "besi 10" atau "semen", tulis persis itu.
  Jangan masukkan jumlah atau satuan jual ke nama.
- qty: angka. Ubah angka yang ditulis dengan huruf (termasuk bahasa daerah) menjadi angka.
  "setengah" = 0.5, "selusin" = 12, "setengah lusin" = 6, "sekodi" = 20. Kalau jumlah tidak disebut, isi 1.
- satuan: satuan jual yang ditulis pelanggan, dinormalkan ke salah satu pilihan
  (kubik → m3, truk/rit → rit, btg/lonjor → batang, kilo → kg, iji/siki/buah/pcs/unit → biji, lbr → lembar,
  box → dus, mtr → meter). Isi null kalau tidak disebut. Berat/ukuran kemasan (mis. "25 kilo" pada cat) adalah
  spesifikasi, bukan satuan jual.
- teks_asli: potongan pesan asli untuk item itu.

Aturan penting:
- Kalau percakapan berisi koreksi ("yang semen tadi jadi 30", "nat nya ga jadi", "kurangi satu", "tambah dua"),
  kembalikan KEADAAN AKHIR pesanan setelah semua koreksi diterapkan. Item yang dibatalkan tidak dimasukkan.
- Barang yang tidak ada di daftar produk tetap diekstrak apa adanya (mis. "closet duduk toto").
- catatan_pengiriman: alamat, nama penerima/proyek, waktu kirim, atau "ambil sendiri". null bila tidak ada.
- Salam, basa-basi, dan pertanyaan yang bukan pesanan tidak dijadikan item. Kalau tidak ada pesanan, items = [].
- Kalau input berupa foto daftar belanja tulisan tangan, baca setiap baris; lewati baris yang sama sekali tidak terbaca.

Daftar produk toko (untuk membantu menormalkan istilah, bukan untuk menebak varian):
${daftar}`;
}

export type DraftLine = { nama: string; qty: number; satuan: string };

export type ExtractionInput = {
  text: string;
  images?: { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }[];
  /** Diisi saat pelanggan merevisi pesanan yang sudah dirangkum. */
  currentOrder?: { lines: DraftLine[]; catatanPengiriman: string | null };
};

/** Teks pesan user untuk model (dipakai semua provider). */
export function buildUserText(input: ExtractionInput): string {
  if (!input.currentOrder) return input.text || "(pelanggan hanya mengirim foto)";
  const lines = input.currentOrder.lines.map((l) => `- ${l.nama}: ${l.qty} ${l.satuan}`).join("\n");
  return `Pesanan pelanggan saat ini:
${lines || "(kosong)"}
Catatan pengiriman saat ini: ${input.currentOrder.catatanPengiriman ?? "(belum ada)"}

Pelanggan mengirim revisi berikut. Kembalikan daftar pesanan LENGKAP setelah revisi diterapkan
(item yang tidak disebut dalam revisi tetap ada, pakai nama persis seperti di atas), dan catatan
pengiriman terbaru (pakai yang lama kalau tidak diubah).

Revisi:
${input.text}`;
}

export function buildUserContent(input: ExtractionInput): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of input.images ?? []) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  content.push({ type: "text", text: buildUserText(input) });
  return content;
}

export class ExtractionError extends Error {}

/** Mengurai teks JSON dari respons menjadi Extraction yang tervalidasi. */
export function parseExtractionJson(json: string): Extraction {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ExtractionError("Respons model bukan JSON yang valid");
  }
  const parsed = ExtractionSchema.safeParse(data);
  if (!parsed.success) throw new ExtractionError(`Respons model tidak sesuai skema: ${parsed.error.message}`);
  return parsed.data;
}

export function toExtractedItems(extraction: Extraction): ExtractedItem[] {
  return extraction.items.map((i) => ({ nama: i.nama, qty: i.qty, satuan: i.satuan, teks_asli: i.teks_asli }));
}

export type ParserConfig = {
  client?: Anthropic;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

export type ExtractionResult = {
  extraction: Extraction;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export type Extractor = (input: ExtractionInput) => Promise<ExtractionResult>;

export function createClaudeExtractor(catalog: CatalogProduct[], config: ParserConfig = {}): Extractor {
  const client = config.client ?? new Anthropic();
  const model = config.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
  const effort = config.effort ?? (process.env.ANTHROPIC_EFFORT as ParserConfig["effort"]) ?? "medium";
  const system = buildSystemPrompt(catalog);

  return async (input) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // Jika model utama menolak (safety classifier), API menjalankan ulang dengan model fallback yang direkomendasikan.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA } },
      system,
      messages: [{ role: "user", content: buildUserContent(input) }],
    });

    if (response.stop_reason === "refusal") throw new ExtractionError("Model menolak memproses pesan ini");
    if (response.stop_reason === "max_tokens") throw new ExtractionError("Respons model terpotong (max_tokens)");

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      extraction: parseExtractionJson(text),
      model: response.model,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  };
}
