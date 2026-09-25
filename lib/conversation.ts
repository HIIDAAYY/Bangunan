/**
 * State machine percakapan WhatsApp per nomor pelanggan.
 *
 *   idle ──pesan berisi barang──▶ klarifikasi (ada item ambigu) ──semua terjawab──▶ konfirmasi
 *     ▲                                                                              │
 *     └──────────────────────── YA (efek: create_order) / BATAL ◀────────────────────┘
 *
 * Murni: extractor & matcher di-inject, tidak ada I/O langsung → mudah dites.
 */
import type { CatalogMatcher, MatchResult } from "./catalog-matcher";
import * as msg from "./messages";
import type { Draft, PendingQuestion, ProductRef } from "./messages";
import { toExtractedItems, type ExtractionInput, type Extractor } from "./order-parser";

export type ConversationState =
  | { step: "idle" }
  | { step: "klarifikasi"; draft: Draft; questions: PendingQuestion[] }
  | { step: "konfirmasi"; draft: Draft };

export type IncomingMessage = { text: string; images?: ExtractionInput["images"] };

export type TurnResult = {
  state: ConversationState;
  replies: string[];
  /** Diisi saat pelanggan mengonfirmasi; pemanggil menyimpan order lalu mengirim msg.orderCreated. */
  effect?: { type: "create_order"; draft: Draft };
};

export type ConversationDeps = { extract: Extractor; matcher: CatalogMatcher };

export const INITIAL_STATE: ConversationState = { step: "idle" };

const YES_WORDS = new Set(["ya", "iya", "y", "yes", "ok", "oke", "okay", "okey", "siap", "betul", "benar", "setuju", "lanjut", "gas", "sip"]);
// Kata yang boleh menyertai "ya" tanpa mengubah maknanya ("ya pak, kirim").
const YES_FILLER = new Set([...YES_WORDS, "pak", "bu", "bos", "mas", "kak", "gan", "bang", "kang", "a", "kirim", "sudah", "udah", "sesuai", "mantap", "terima", "kasih", "makasih", "tq", "thanks", "itu", "aja", "deh", "dong"]);
const CANCEL_WORDS = new Set(["batal", "cancel", "batalkan"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const squeeze = (w: string) => w.replace(/(.)\1+$/, "$1"); // "yaaa" -> "ya", "okee" -> "oke"

export function isYes(text: string): boolean {
  const w = words(text).map(squeeze);
  // "ya", "iya pak", "ok siap kirim" — tapi bukan "ya tambah paku 2 kg" (itu revisi).
  return w.length > 0 && YES_WORDS.has(w[0]) && w.every((x) => YES_FILLER.has(x));
}

export function isCancel(text: string): boolean {
  const w = words(text);
  return w.length > 0 && w.length <= 3 && CANCEL_WORDS.has(w[0]);
}

/** "UBAH semen jadi 30" → "semen jadi 30"; null bila bukan perintah UBAH. */
export function revisionText(text: string): string | null {
  const m = text.trim().match(/^(ubah|ganti|revisi)\b[\s:,-]*(.*)$/is);
  return m ? m[2].trim() : null;
}

function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

const ref = (p: ProductRef): ProductRef => ({ sku: p.sku, nama: p.nama, satuan: p.satuan, harga: p.harga });

function addLine(draft: Draft, product: ProductRef, qty: number): Draft {
  const existing = draft.lines.find((l) => l.sku === product.sku);
  const lines = existing
    ? draft.lines.map((l) => (l.sku === product.sku ? { ...l, qty: l.qty + qty } : l))
    : [...draft.lines, { ...ref(product), qty }];
  return { ...draft, lines };
}

export function buildDraft(results: MatchResult[], catatanPengiriman: string | null): { draft: Draft; questions: PendingQuestion[] } {
  let draft: Draft = { lines: [], tidakTersedia: [], catatanPengiriman };
  const questions: PendingQuestion[] = [];
  for (const r of results) {
    const teks = r.item.teks_asli ?? r.item.nama;
    const base = { teks, nama: r.item.nama, qty: r.item.qty, satuan: r.item.satuan };
    switch (r.status) {
      case "matched":
        draft = addLine(draft, r.product, r.item.qty);
        break;
      case "ambiguous":
        questions.push({ kind: "pilih", ...base, reason: r.reason, candidates: r.candidates.map(ref) });
        break;
      case "unit_mismatch":
        questions.push({ kind: "jumlah", ...base, product: ref(r.product) });
        break;
      case "not_found":
        draft = { ...draft, tidakTersedia: [...draft.tidakTersedia, teks] };
        break;
    }
  }
  return { draft, questions };
}

/** Lanjut ke pertanyaan berikutnya, atau ke ringkasan bila semua sudah jelas. */
function advance(draft: Draft, questions: PendingQuestion[], prefix: string[] = []): TurnResult {
  if (questions.length > 0) {
    return { state: { step: "klarifikasi", draft, questions }, replies: [...prefix, msg.question(questions[0])] };
  }
  if (draft.lines.length === 0) {
    const replies = draft.tidakTersedia.length ? [...prefix, msg.notAvailable(draft.tidakTersedia), msg.NO_ITEMS] : [...prefix, msg.NO_ITEMS];
    return { state: INITIAL_STATE, replies };
  }
  return { state: { step: "konfirmasi", draft }, replies: [...prefix, msg.summary(draft)] };
}

async function extractAndBuild(input: ExtractionInput, deps: ConversationDeps) {
  const { extraction } = await deps.extract(input);
  return buildDraft(toExtractedItems(extraction).map(deps.matcher.match), extraction.catatan_pengiriman);
}

async function startNewOrder(message: IncomingMessage, deps: ConversationDeps): Promise<TurnResult> {
  const { draft, questions } = await extractAndBuild({ text: message.text, images: message.images }, deps);
  if (draft.lines.length === 0 && questions.length === 0 && draft.tidakTersedia.length === 0) {
    // Sapaan singkat ("halo", "pagi pak") → panduan; pesan panjang tanpa barang → minta ulang.
    const short = words(message.text).length <= 3 && !message.images?.length;
    return { state: INITIAL_STATE, replies: [short ? msg.HELP : msg.NO_ITEMS] };
  }
  return advance(draft, questions);
}

async function revise(state: Exclude<ConversationState, { step: "idle" }>, text: string, deps: ConversationDeps, implicit: boolean): Promise<TurnResult> {
  const pending = state.step === "klarifikasi" ? state.questions : [];
  const lines = [
    ...state.draft.lines.map((l) => ({ nama: l.nama, qty: l.qty, satuan: l.satuan })),
    ...pending.map((q) => ({ nama: q.teks, qty: q.qty, satuan: q.satuan ?? "" })),
  ];
  const built = await extractAndBuild(
    { text, currentOrder: { lines, catatanPengiriman: state.draft.catatanPengiriman } },
    deps,
  );
  // Revisi yang tidak menyebut alamat ("semen jadi 30") tidak boleh menghapus alamat yang sudah ada,
  // walaupun extractor mengembalikan null.
  const draft = { ...built.draft, catatanPengiriman: built.draft.catatanPengiriman ?? state.draft.catatanPengiriman };
  const { questions } = built;
  // Pesan bebas yang tidak mengubah apa-apa (mis. "terima kasih") → ingatkan cara konfirmasi.
  const unchanged =
    questions.length === 0 &&
    JSON.stringify(draft.lines) === JSON.stringify(state.draft.lines) &&
    draft.catatanPengiriman === state.draft.catatanPengiriman;
  if (implicit && unchanged && state.step === "konfirmasi") {
    return { state, replies: [msg.CONFIRM_HINT] };
  }
  return advance(draft, questions);
}

function answerQuestion(state: Extract<ConversationState, { step: "klarifikasi" }>, text: string, deps: ConversationDeps): TurnResult | null {
  const [q, ...rest] = state.questions;
  const n = parseNumber(text);

  if (n === 0) return advance(state.draft, rest);

  if (q.kind === "jumlah") {
    return n !== null ? advance(addLine(state.draft, q.product, n), rest) : null;
  }

  if (n !== null && Number.isInteger(n) && n >= 1 && n <= q.candidates.length) {
    return advance(addLine(state.draft, q.candidates[n - 1], q.qty), rest);
  }
  // Jawaban bebas, mis. "yang 10" atau "banci": gabungkan dengan teks item lalu cocokkan ke kandidat.
  const picked = deps.matcher.matchAmong(`${q.nama} ${text}`, q.candidates, q.satuan);
  if (picked) {
    const candidate = q.candidates.find((c) => c.sku === picked.sku)!;
    return advance(addLine(state.draft, candidate, q.qty), rest);
  }
  return null;
}

export async function handleMessage(state: ConversationState, message: IncomingMessage, deps: ConversationDeps): Promise<TurnResult> {
  const text = message.text.trim();
  const hasImages = (message.images?.length ?? 0) > 0;

  if (state.step !== "idle" && isCancel(text)) {
    return { state: INITIAL_STATE, replies: [msg.CANCELLED] };
  }

  try {
    switch (state.step) {
      case "idle": {
        if (!text && !hasImages) return { state, replies: [msg.HELP] };
        return await startNewOrder({ text: revisionText(text) ?? text, images: message.images }, deps);
      }

      case "klarifikasi": {
        const revision = revisionText(text);
        if (revision !== null) {
          return revision ? await revise(state, revision, deps, false) : { state, replies: [msg.ASK_REVISION] };
        }
        return answerQuestion(state, text, deps) ?? { state, replies: [msg.invalidAnswer(state.questions[0])] };
      }

      case "konfirmasi": {
        if (isYes(text)) {
          return { state: INITIAL_STATE, replies: [], effect: { type: "create_order", draft: state.draft } };
        }
        const revision = revisionText(text);
        if (revision === "") return { state, replies: [msg.ASK_REVISION] };
        if (hasImages) return await startNewOrder(message, deps);
        return await revise(state, revision ?? text, deps, revision === null);
      }
    }
  } catch (err) {
    console.error("handleMessage: ekstraksi gagal", err);
    return { state, replies: [msg.EXTRACTION_FAILED] };
  }
}
