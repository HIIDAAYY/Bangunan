import { describe, expect, it, vi } from "vitest";
import { loadCatalogFromFile } from "@/lib/catalog";
import { createCatalogMatcher } from "@/lib/catalog-matcher";
import {
  handleMessage,
  INITIAL_STATE,
  isYes,
  revisionText,
  type ConversationDeps,
  type ConversationState,
} from "@/lib/conversation";
import * as msg from "@/lib/messages";
import type { Extraction, ExtractionInput } from "@/lib/order-parser";

const matcher = createCatalogMatcher(loadCatalogFromFile());

type Item = [nama: string, qty: number, satuan: Extraction["items"][number]["satuan"]];

/** Extractor tiruan: memetakan teks pesan → item, tanpa memanggil API. */
function fakeDeps(script: Record<string, { items: Item[]; catatan?: string | null }>): ConversationDeps & {
  extract: ReturnType<typeof vi.fn>;
} {
  const extract = vi.fn(async (input: ExtractionInput) => {
    const entry = script[input.text];
    if (!entry) throw new Error(`teks tidak ada di skrip: ${input.text}`);
    return {
      extraction: {
        items: entry.items.map(([nama, qty, satuan]) => ({ teks_asli: `${nama} ${qty}`, nama, qty, satuan })),
        catatan_pengiriman: entry.catatan ?? null,
      },
      model: "fake",
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  });
  return { extract, matcher };
}

async function run(deps: ConversationDeps, ...texts: string[]) {
  let state: ConversationState = INITIAL_STATE;
  let last = await handleMessage(state, { text: texts[0] }, deps);
  state = last.state;
  for (const t of texts.slice(1)) {
    last = await handleMessage(state, { text: t }, deps);
    state = last.state;
  }
  return last;
}

const skus = (s: ConversationState) => (s.step === "idle" ? [] : s.draft.lines.map((l) => `${l.sku}×${l.qty}`));

describe("isYes / revisionText", () => {
  it.each(["YA", "ya", "Iya pak", "yaaa", "ok siap", "Oke, kirim", "YA 👍", "betul"])("%s → ya", (t) => {
    expect(isYes(t)).toBe(true);
  });
  it.each(["ya tambah paku 2 kg", "yang semen jadi 30", "tidak", "ubah", ""])("%s → bukan ya", (t) => {
    expect(isYes(t)).toBe(false);
  });
  it("revisionText", () => {
    expect(revisionText("UBAH semen jadi 30")).toBe("semen jadi 30");
    expect(revisionText("ubah: alamat ke jl mawar")).toBe("alamat ke jl mawar");
    expect(revisionText("UBAH")).toBe("");
    expect(revisionText("ubahnya nanti")).toBeNull();
    expect(revisionText("semen jadi 30")).toBeNull();
  });
});

describe("pesanan jelas → ringkasan → YA", () => {
  const deps = fakeDeps({
    "semen tiga roda 20 sak, pasir cor 1 rit, kirim ke jl melati 5": {
      items: [["semen tiga roda", 20, "sak"], ["pasir cor", 1, "rit"]],
      catatan: "jl melati 5",
    },
  });
  const order = "semen tiga roda 20 sak, pasir cor 1 rit, kirim ke jl melati 5";

  it("membalas ringkasan dengan subtotal, total, dan cara konfirmasi", async () => {
    const r = await run(deps, order);
    expect(r.state.step).toBe("konfirmasi");
    expect(skus(r.state)).toEqual(["SMN-TR-50×20", "PSR-COR-RIT×1"]);
    const reply = r.replies[0];
    expect(reply).toContain("20 sak × Rp68.000 = *Rp1.360.000*");
    expect(reply).toContain("1 rit × Rp2.150.000 = *Rp2.150.000*");
    expect(reply).toContain("*Total: Rp3.510.000*");
    expect(reply).toContain("jl melati 5");
    expect(reply).toContain("*YA*");
  });

  it("YA → efek create_order dan state kembali idle", async () => {
    const r = await run(deps, order, "Ya pak");
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.effect?.type).toBe("create_order");
    expect(r.effect?.draft.lines.map((l) => l.sku)).toEqual(["SMN-TR-50", "PSR-COR-RIT"]);
    expect(msg.draftTotal(r.effect!.draft)).toBe(3_510_000);
  });
});

describe("UBAH", () => {
  const deps = fakeDeps({
    "semen tiga roda 20 sak": { items: [["semen tiga roda", 20, "sak"]] },
    "semen jadi 30": { items: [["Semen Tiga Roda 50kg", 30, "sak"]] },
    "tambah paku 5cm 2 kg": { items: [["Semen Tiga Roda 50kg", 20, "sak"], ["paku 5 cm", 2, "kg"]] },
    "terima kasih": { items: [["Semen Tiga Roda 50kg", 20, "sak"]] },
  });

  it("UBAH ... mengirim pesanan saat ini ke extractor dan merangkum ulang", async () => {
    const r = await run(deps, "semen tiga roda 20 sak", "UBAH semen jadi 30");
    expect(skus(r.state)).toEqual(["SMN-TR-50×30"]);
    const revisionCall = deps.extract.mock.calls.at(-1)![0] as ExtractionInput;
    expect(revisionCall.currentOrder?.lines).toEqual([{ nama: "Semen Tiga Roda 50kg", qty: 20, satuan: "sak" }]);
    expect(r.replies[0]).toContain("Ringkasan Pesanan");
  });

  it("revisi yang tidak menyebut alamat mempertahankan alamat lama", async () => {
    const deps2 = fakeDeps({
      "semen tiga roda 20 sak kirim ke jl melati 5": { items: [["semen tiga roda", 20, "sak"]], catatan: "jl melati 5" },
      "semen jadi 30": { items: [["Semen Tiga Roda 50kg", 30, "sak"]], catatan: null },
    });
    const r = await run(deps2, "semen tiga roda 20 sak kirim ke jl melati 5", "UBAH semen jadi 30");
    expect(r.state.step === "konfirmasi" && r.state.draft.catatanPengiriman).toBe("jl melati 5");
    expect(r.replies[0]).toContain("Pengiriman: jl melati 5");
  });

  it("revisi tanpa kata UBAH juga diproses", async () => {
    const r = await run(deps, "semen tiga roda 20 sak", "tambah paku 5cm 2 kg");
    expect(skus(r.state)).toEqual(["SMN-TR-50×20", "PKU-5CM×2"]);
  });

  it('"ya tambah ..." diperlakukan sebagai revisi, bukan konfirmasi', async () => {
    const deps2 = fakeDeps({
      "semen tiga roda 20 sak": { items: [["semen tiga roda", 20, "sak"]] },
      "ya tambah paku 5cm 2 kg": { items: [["Semen Tiga Roda 50kg", 20, "sak"], ["paku 5 cm", 2, "kg"]] },
    });
    const r = await run(deps2, "semen tiga roda 20 sak", "ya tambah paku 5cm 2 kg");
    expect(r.effect).toBeUndefined();
    expect(skus(r.state)).toEqual(["SMN-TR-50×20", "PKU-5CM×2"]);
  });

  it("pesan bebas yang tidak mengubah pesanan → pengingat cara konfirmasi", async () => {
    const r = await run(deps, "semen tiga roda 20 sak", "terima kasih");
    expect(r.state.step).toBe("konfirmasi");
    expect(r.replies).toEqual([msg.CONFIRM_HINT]);
  });

  it("UBAH tanpa isi → tanya mau diubah apa", async () => {
    const r = await run(deps, "semen tiga roda 20 sak", "UBAH");
    expect(r.replies).toEqual([msg.ASK_REVISION]);
    expect(r.state.step).toBe("konfirmasi");
  });
});

describe("item ambigu", () => {
  const deps = fakeDeps({
    "hebel 3 kubik, semen instan 6 sak": { items: [["hebel", 3, "m3"], ["semen instan", 6, "sak"]] },
    "besi 10 50 batang, hebel 2 kubik": { items: [["besi 10", 50, "batang"], ["hebel", 2, "m3"]] },
  });
  const order = "hebel 3 kubik, semen instan 6 sak";

  it("bertanya dengan pilihan bernomor", async () => {
    const r = await run(deps, order);
    expect(r.state.step).toBe("klarifikasi");
    expect(r.replies[0]).toContain("1. Bata Ringan (Hebel) 60x20x7,5cm per Kubik");
    expect(r.replies[0]).toContain("2. Bata Ringan (Hebel) 60x20x10cm per Kubik");
    expect(r.replies[0]).toContain("0. Hapus item ini");
  });

  it("jawaban nomor → item terpilih dengan qty awal, lalu ringkasan", async () => {
    const r = await run(deps, order, "2");
    expect(r.state.step).toBe("konfirmasi");
    expect(skus(r.state)).toEqual(["SMN-MU-40×6", "HBL-10-M3×3"]);
  });

  it('jawaban bebas ("yang 7,5") dicocokkan ke kandidat', async () => {
    const r = await run(deps, order, "yang 7,5");
    expect(skus(r.state)).toEqual(["SMN-MU-40×6", "HBL-075-M3×3"]);
  });

  it("jawaban tidak valid → tanya ulang, state tetap", async () => {
    const first = await run(deps, order);
    const r = await handleMessage(first.state, { text: "5" }, deps);
    expect(r.state).toEqual(first.state);
    expect(r.replies[0]).toContain("nomor pilihan (1–2)");
  });

  it("0 → item dihapus", async () => {
    const r = await run(deps, order, "0");
    expect(skus(r.state)).toEqual(["SMN-MU-40×6"]);
  });

  it("beberapa item ambigu ditanyakan satu per satu", async () => {
    const r1 = await run(deps, "besi 10 50 batang, hebel 2 kubik");
    expect(r1.replies[0]).toContain("Besi Beton 10mm Full SNI");
    const r2 = await handleMessage(r1.state, { text: "banci" }, deps);
    expect(r2.state.step).toBe("klarifikasi");
    expect(r2.replies[0]).toContain("Hebel");
    const r3 = await handleMessage(r2.state, { text: "1" }, deps);
    expect(skus(r3.state)).toEqual(["BSI-10-BCI×50", "HBL-075-M3×2"]);
  });
});

describe("satuan tidak cocok", () => {
  const deps = fakeDeps({ "paku beton 2 kg": { items: [["paku beton", 2, "kg"]] } });

  it("menanyakan jumlah dalam satuan jual", async () => {
    const r1 = await run(deps, "paku beton 2 kg");
    expect(r1.replies[0]).toContain("per *dus*");
    const r2 = await handleMessage(r1.state, { text: "3" }, deps);
    expect(skus(r2.state)).toEqual(["PKU-BTN×3"]);
  });
});

describe("tidak ada di katalog", () => {
  const deps = fakeDeps({
    "closet toto 1, pralon 4 dim 6 batang": { items: [["closet duduk toto", 1, "biji"], ["pralon 4 dim", 6, "batang"]] },
    "closet toto 1": { items: [["closet duduk toto", 1, "biji"]] },
  });

  it("dicantumkan di ringkasan sebagai tidak tersedia", async () => {
    const r = await run(deps, "closet toto 1, pralon 4 dim 6 batang");
    expect(skus(r.state)).toEqual(["PPA-RCK-4×6"]);
    expect(r.replies[0]).toContain("Tidak tersedia di katalog kami: closet duduk toto 1");
  });

  it("jika semua item tidak tersedia → kembali idle dengan penjelasan", async () => {
    const r = await run(deps, "closet toto 1");
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.replies[0]).toContain("tidak tersedia");
  });
});

describe("lain-lain", () => {
  it("item dengan SKU sama digabung", async () => {
    const deps = fakeDeps({ "x": { items: [["semen tiga roda", 10, "sak"], ["TR 50", 5, "sak"]] } });
    const r = await run(deps, "x");
    expect(skus(r.state)).toEqual(["SMN-TR-50×15"]);
  });

  it("sapaan tanpa barang → panduan", async () => {
    const deps = fakeDeps({ "halo pak": { items: [] } });
    const r = await run(deps, "halo pak");
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.replies).toEqual([msg.HELP]);
  });

  it("UBAH tanpa pesanan yang sedang dikonfirmasi → penjelasan, bukan 'tidak tersedia'", async () => {
    const deps = fakeDeps({});
    const r = await handleMessage(INITIAL_STATE, { text: "UBAH semen jadi 30" }, deps);
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.replies).toEqual([msg.NOTHING_TO_REVISE]);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("BATAL mengosongkan draf", async () => {
    const deps = fakeDeps({ "semen tiga roda 20 sak": { items: [["semen tiga roda", 20, "sak"]] } });
    const r = await run(deps, "semen tiga roda 20 sak", "batal");
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.replies).toEqual([msg.CANCELLED]);
  });

  it("ekstraksi gagal → pesan maaf dan state tidak berubah", async () => {
    const deps = fakeDeps({});
    const r = await handleMessage(INITIAL_STATE, { text: "semen 20" }, deps);
    expect(r.state).toEqual(INITIAL_STATE);
    expect(r.replies).toEqual([msg.EXTRACTION_FAILED]);
  });
});
