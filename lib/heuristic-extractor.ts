/**
 * Extractor berbasis regex, TANPA Claude. Hanya untuk E2E test & demo lokal tanpa API key
 * (aktif bila EXTRACTOR=heuristik). Memahami format sederhana: "<barang> <jumlah> <satuan>"
 * dipisah koma/baris, dan "kirim ke ..." sebagai catatan pengiriman.
 */
import type { Extraction, Extractor } from "./order-parser";
import { SATUAN } from "./order-parser";

const UNIT_ALIASES: Record<string, (typeof SATUAN)[number]> = {
  sak: "sak", zak: "sak", kubik: "m3", m3: "m3", rit: "rit", truk: "rit", batang: "batang", btg: "batang",
  kg: "kg", kilo: "kg", biji: "biji", pcs: "biji", buah: "biji", unit: "biji", lembar: "lembar", lbr: "lembar",
  galon: "galon", pail: "pail", kaleng: "kaleng", dus: "dus", bungkus: "bungkus", meter: "meter",
};

const ITEM_RE = new RegExp(`^(.*?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(UNIT_ALIASES).join("|")})?\\s*$`, "i");

export function heuristicExtract(text: string, revision?: { lines: { nama: string; qty: number; satuan: string }[] }): Extraction {
  let catatan: string | null = null;
  const body = text.replace(/(?:,|\n|^)\s*(kirim(?:kan)?\s+ke|antar\s+ke|alamat)\s*:?\s*(.+)$/is, (_m, _k, alamat: string) => {
    catatan = alamat.trim();
    return "";
  });

  const items: Extraction["items"] = [];
  for (const raw of body.split(/[,\n;]|\s+(?:dan|sama|ama)\s+/i)) {
    const part = raw.replace(/^\s*\d+[.)]\s*/, "").trim();
    const m = part.match(ITEM_RE);
    if (!m) continue;
    const satuan = m[3] ? UNIT_ALIASES[m[3].toLowerCase()] : null;
    items.push({ teks_asli: part, nama: m[1].trim(), qty: Number(m[2].replace(",", ".")), satuan });
  }

  if (revision) {
    // Revisi sederhana: "<barang> jadi <n>" mengganti qty baris yang namanya mengandung <barang>.
    const change = text.match(/(.+?)\s+jadi\s+(\d+(?:[.,]\d+)?)/i);
    const lines = revision.lines.map((l) => ({ teks_asli: l.nama, nama: l.nama, qty: l.qty, satuan: (l.satuan || null) as Extraction["items"][number]["satuan"] }));
    if (change) {
      const target = change[1].trim().toLowerCase();
      for (const l of lines) if (l.nama.toLowerCase().includes(target)) l.qty = Number(change[2].replace(",", "."));
    }
    return { items: [...lines, ...items.filter((i) => !change || !i.teks_asli.includes("jadi"))], catatan_pengiriman: catatan };
  }
  return { items, catatan_pengiriman: catatan };
}

export const heuristicExtractor: Extractor = async (input) => ({
  extraction: heuristicExtract(input.text, input.currentOrder),
  model: "heuristik",
  usage: { input_tokens: 0, output_tokens: 0 },
});
