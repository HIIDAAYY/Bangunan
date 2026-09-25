/**
 * Mencocokkan item hasil ekstraksi ("besi 10 banci", 50, "batang") ke produk katalog.
 * Modul murni: tidak ada I/O, deterministik, mudah dites.
 *
 * Urutan:
 *   1. exact    — teks (setelah normalisasi) sama dengan nama/alias produk
 *   2. cakupan  — semua kata penting ada di kosakata produk, angka spesifikasi konsisten,
 *                 satuan cocok; kata yang typo dikoreksi dulu dengan Fuse.js
 *   3. sebagian — tidak ada yang cocok penuh → saran (ambigu) atau tidak ditemukan
 */
import Fuse from "fuse.js";
import type { CatalogProduct } from "./catalog";

export type ExtractedItem = {
  nama: string;
  qty: number;
  satuan: string | null;
  teks_asli?: string;
};

export type MatchResult =
  | { status: "matched"; item: ExtractedItem; product: CatalogProduct; via: "exact" | "alias" | "cakupan"; confidence: number }
  | { status: "ambiguous"; item: ExtractedItem; candidates: CatalogProduct[]; reason: "banyak_pilihan" | "varian_tidak_ada" | "sebagian" }
  | { status: "unit_mismatch"; item: ExtractedItem; product: CatalogProduct }
  | { status: "not_found"; item: ExtractedItem };

export const MAX_CANDIDATES = 3;

// ---------------------------------------------------------------------------
// Normalisasi teks
// ---------------------------------------------------------------------------

const TOKEN_SYNONYMS: Record<string, string> = {
  mili: "mm",
  milli: "mm",
  milimeter: "mm",
  senti: "cm",
  centi: "cm",
  kilo: "kg",
  kilogram: "kg",
  kilogramm: "kg",
  inch: "dim",
  inchi: "dim",
  inci: "dim",
  in: "dim",
  kubik: "m3",
  kubic: "m3",
  kibik: "m3",
  paralon: "pralon",
  tripleks: "triplek",
  multiplek: "triplek",
  zak: "sak",
};

/** Kata satuan/ukuran: boleh ada di teks, tapi tidak wajib ada di kosakata produk. */
const UNIT_WORDS = new Set([
  "kg", "mm", "cm", "m", "dim", "m3", "sak", "batang", "btg", "lembar", "lbr", "biji", "pcs", "dus",
  "rit", "meter", "mtr", "liter", "galon", "pail", "kaleng", "bungkus", "unit", "buah", "truk", "lonjor", "x",
]);

const STOPWORDS = new Set([
  "yang", "yg", "merk", "merek", "ukuran", "uk", "isi", "tipe", "type", "dan", "sama", "ama", "untuk", "buat",
  "per", "pak", "mas", "ya", "aja", "saja", "nya",
]);

const NUMBER_RE = /^\d+(?:[./]\d+)?$/;

export function normalize(text: string): string {
  let s = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s
    .replace(/m³|\bm3\b/g, " kubik ")
    .replace(/⁄/g, "/") // NFKD mengubah "½" menjadi "1⁄2" (fraction slash)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/"/g, " dim ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(?<!\d)[./]|[./](?!\d)/g, " ")
    .replace(/[^a-z0-9./ ]+/g, " ");
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => (NUMBER_RE.test(t) ? canonicalNumber(t) : (TOKEN_SYNONYMS[t] ?? t)))
    .join(" ");
}

function canonicalNumber(t: string): string {
  if (t.includes("/")) return t;
  return String(Number(t));
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

const isNumber = (t: string) => NUMBER_RE.test(t);
const isSignificant = (t: string) => !isNumber(t) && !UNIT_WORDS.has(t) && !STOPWORDS.has(t);

// ---------------------------------------------------------------------------
// Satuan
// ---------------------------------------------------------------------------

const UNIT_GROUPS: Record<string, string> = {
  sak: "sak", zak: "sak",
  m3: "m3", kubik: "m3", "m³": "m3", kubic: "m3",
  rit: "rit", ret: "rit", truk: "rit", truck: "rit",
  batang: "batang", btg: "batang", lonjor: "batang",
  kg: "kg", kilo: "kg", kilogram: "kg",
  biji: "biji", pcs: "biji", buah: "biji", bh: "biji", unit: "biji", iji: "biji", siki: "biji", butir: "biji",
  lembar: "lembar", lbr: "lembar", lmbr: "lembar",
  galon: "kemasan", pail: "kemasan", kaleng: "kemasan",
  dus: "dus", box: "dus", kotak: "dus", karton: "dus",
  bungkus: "bungkus", bks: "bungkus", sachet: "bungkus",
  meter: "meter", m: "meter", mtr: "meter",
};

/** "Kubik" -> "m3", "pcs" -> "biji"; null bila tidak dikenal/kosong (tidak dipakai untuk menyaring). */
export function unitGroup(satuan: string | null | undefined): string | null {
  if (!satuan) return null;
  return UNIT_GROUPS[satuan.trim().toLowerCase()] ?? null;
}

function unitCompatible(item: ExtractedItem, product: CatalogProduct): boolean {
  const want = unitGroup(item.satuan);
  return want === null || want === unitGroup(product.satuan);
}

// ---------------------------------------------------------------------------
// Indeks katalog
// ---------------------------------------------------------------------------

type IndexedProduct = {
  product: CatalogProduct;
  order: number;
  entries: string[][]; // token nama + setiap alias
  vocab: Set<string>;
  numbers: Set<string>;
};

/** Angka spesifikasi dari nama, tanpa panjang batang/lembar ("12 m", "4 m") yang tidak membedakan produk. */
function specNumbers(tokens: string[]): string[] {
  return tokens.filter((t, i) => isNumber(t) && tokens[i + 1] !== "m");
}

function isSubset(small: string[], big: string[]): boolean {
  const pool = [...big];
  for (const t of small) {
    const i = pool.indexOf(t);
    if (i === -1) return false;
    pool.splice(i, 1);
  }
  return true;
}

export type CatalogMatcher = {
  match(item: ExtractedItem): MatchResult;
  /** Mencocokkan jawaban bebas ("yang 10") terhadap kandidat pertanyaan sebelumnya. */
  matchAmong(text: string, candidates: { sku: string }[], satuan: string | null): CatalogProduct | null;
};

export function createCatalogMatcher(catalog: CatalogProduct[]): CatalogMatcher {
  const index: IndexedProduct[] = catalog.map((product, order) => {
    const nameTokens = tokenize(product.nama);
    const aliasTokens = product.alias.map(tokenize);
    const entries = [nameTokens, ...aliasTokens];
    return {
      product,
      order,
      entries,
      vocab: new Set(entries.flat().filter((t) => !isNumber(t))),
      numbers: new Set([...specNumbers(nameTokens), ...aliasTokens.flat().filter(isNumber)]),
    };
  });

  const exactMap = new Map<string, IndexedProduct>();
  for (const ip of index) {
    for (const e of ip.entries) exactMap.set(e.join(" "), ip);
  }

  const allVocab = [...new Set(index.flatMap((ip) => [...ip.vocab]))];
  const vocabSet = new Set(allVocab);
  const fuse = new Fuse(allVocab, { includeScore: true, threshold: 0.3, ignoreLocation: true });

  function correctToken(t: string): string {
    if (vocabSet.has(t) || !isSignificant(t) || t.length < 4) return t;
    const [best] = fuse.search(t, { limit: 1 });
    return best && (best.score ?? 1) <= 0.3 ? best.item : t;
  }

  function numbersConsistent(ip: IndexedProduct, rawNumbers: string[]): boolean {
    return rawNumbers.every((n) => ip.numbers.has(n));
  }

  function coverage(ip: IndexedProduct, significant: string[]): number {
    if (significant.length === 0) return 0;
    return significant.filter((t) => ip.vocab.has(t)).length / significant.length;
  }

  function containment(ip: IndexedProduct, tokens: string[]): number {
    let best = 0;
    for (const e of ip.entries) if (e.length > best && isSubset(e, tokens)) best = e.length;
    return best;
  }

  function withUnitSibling(item: ExtractedItem, ip: IndexedProduct): IndexedProduct | null {
    if (unitCompatible(item, ip.product)) return ip;
    const family = ip.product.sku.split("-").slice(0, 2).join("-");
    return index.find((o) => o.product.sku.startsWith(family + "-") && unitCompatible(item, o.product)) ?? null;
  }

  function finalizeMatch(item: ExtractedItem, ip: IndexedProduct, via: "exact" | "alias" | "cakupan", confidence: number): MatchResult {
    const resolved = withUnitSibling(item, ip);
    if (!resolved) return { status: "unit_mismatch", item, product: ip.product };
    return { status: "matched", item, product: resolved.product, via, confidence };
  }

  function rank(cands: IndexedProduct[], tokens: string[]) {
    return cands
      .map((ip) => ({ ip, contain: containment(ip, tokens) }))
      .sort((a, b) => b.contain - a.contain || a.ip.order - b.ip.order);
  }

  function match(item: ExtractedItem): MatchResult {
    const tokens = tokenize(item.nama)
      .filter((t) => !STOPWORDS.has(t))
      .map(correctToken);
    const key = tokens.join(" ");

    // 1. exact
    const exact = exactMap.get(key);
    if (exact) return finalizeMatch(item, exact, "exact", 1);

    const significant = tokens.filter(isSignificant);
    const rawNumbers = tokens.filter(isNumber);
    if (significant.length === 0) return { status: "not_found", item };

    // 2. cakupan penuh
    const full = index.filter((ip) => coverage(ip, significant) === 1);
    const consistent = full.filter((ip) => numbersConsistent(ip, rawNumbers));
    const unitOk = consistent.filter((ip) => unitCompatible(item, ip.product));
    const pool = unitOk.length > 0 ? unitOk : consistent;

    if (pool.length === 1) {
      const contain = containment(pool[0], tokens);
      return finalizeMatch(item, pool[0], contain > 0 ? "alias" : "cakupan", contain > 0 ? 0.9 : 0.75);
    }
    if (pool.length > 1) {
      const ranked = rank(pool, tokens);
      const [first, second] = ranked;
      if (first.contain > 0 && first.contain > second.contain) {
        return finalizeMatch(item, first.ip, "alias", 0.9);
      }
      const top = ranked.filter((r) => r.contain === first.contain);
      return {
        status: "ambiguous",
        item,
        candidates: top.slice(0, MAX_CANDIDATES).map((r) => r.ip.product),
        reason: "banyak_pilihan",
      };
    }
    if (full.length > 0) {
      // Kata cocok tapi ukuran/angka tidak ada, mis. "semen gresik 50 kg" padahal hanya ada 40 kg.
      return {
        status: "ambiguous",
        item,
        candidates: rank(full, tokens).slice(0, MAX_CANDIDATES).map((r) => r.ip.product),
        reason: "varian_tidak_ada",
      };
    }

    // 3. cakupan sebagian
    const partial = index
      .map((ip) => ({ ip, cov: coverage(ip, significant) }))
      .filter((r) => r.cov >= 2 / 3 && numbersConsistent(r.ip, rawNumbers))
      .sort((a, b) => b.cov - a.cov || a.ip.order - b.ip.order);
    if (partial.length > 0) {
      return {
        status: "ambiguous",
        item,
        candidates: partial.slice(0, MAX_CANDIDATES).map((r) => r.ip.product),
        reason: "sebagian",
      };
    }
    return { status: "not_found", item };
  }

  function matchAmong(text: string, candidates: { sku: string }[], satuan: string | null): CatalogProduct | null {
    const allowed = new Set(candidates.map((c) => c.sku));
    const result = match({ nama: text, qty: 1, satuan });
    if (result.status === "matched" && allowed.has(result.product.sku)) return result.product;
    if (result.status === "ambiguous") {
      const hits = result.candidates.filter((c) => allowed.has(c.sku));
      if (hits.length === 1) return hits[0];
    }
    return null;
  }

  return { match, matchAmong };
}
