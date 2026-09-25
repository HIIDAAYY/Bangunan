import { describe, expect, it } from "vitest";
import { loadCatalogFromFile } from "@/lib/catalog";
import { createCatalogMatcher } from "@/lib/catalog-matcher";
import { handleMessage, INITIAL_STATE, type ConversationState } from "@/lib/conversation";
import { DEMO_EXAMPLES } from "@/lib/demo-examples";
import { heuristicExtractor } from "@/lib/heuristic-extractor";

// Demo publik memakai extractor heuristik. Pastikan setiap contoh menghasilkan alur yang diharapkan.
const deps = { extract: heuristicExtractor, matcher: createCatalogMatcher(loadCatalogFromFile()) };

async function chat(...texts: string[]) {
  let state: ConversationState = INITIAL_STATE;
  let last = await handleMessage(state, { text: texts[0] }, deps);
  for (const t of texts.slice(1)) {
    state = last.state;
    last = await handleMessage(state, { text: t }, deps);
  }
  return last;
}

const skus = (s: ConversationState) => (s.step === "idle" ? [] : s.draft.lines.map((l) => `${l.sku}×${l.qty}`));

describe("contoh demo publik (extractor heuristik)", () => {
  it("semua contoh punya teks unik", () => {
    expect(new Set(DEMO_EXAMPLES.map((e) => e.text)).size).toBe(DEMO_EXAMPLES.length);
  });

  it("item ambigu → pilih → UBAH → YA", async () => {
    const [ex] = DEMO_EXAMPLES;
    const q = await chat(ex.text);
    expect(q.replies[0]).toContain("maksudnya yang mana");
    const summary = await chat(ex.text, "2");
    expect(skus(summary.state)).toEqual(["SMN-TR-50×20", "HBL-10-M3×3"]);
    const revised = await chat(ex.text, "2", "UBAH semen jadi 30");
    expect(skus(revised.state)).toEqual(["SMN-TR-50×30", "HBL-10-M3×3"]);
    // Regresi: revisi jumlah sempat menghapus alamat yang sudah ada.
    expect(revised.state.step !== "idle" && revised.state.draft.catatanPengiriman).toBe("Jl. Melati 5");
    const done = await chat(ex.text, "2", "UBAH semen jadi 30", "YA");
    expect(done.effect?.type).toBe("create_order");
  });

  it("besi full/banci ditanyakan", async () => {
    const r = await chat(DEMO_EXAMPLES[1].text, "banci");
    expect(skus(r.state)).toEqual(["SMN-GR-40×10", "BSI-10-BCI×50"]);
  });

  it("barang tidak ada di katalog dicantumkan di ringkasan", async () => {
    const r = await chat(DEMO_EXAMPLES[2].text);
    expect(skus(r.state)).toEqual(["PSR-COR-RIT×1", "BTU-SPL-M3×2"]);
    expect(r.replies[0]).toContain("Tidak tersedia di katalog kami: closet toto 1 unit");
  });

  it("satuan berbeda → tanya jumlah dalam satuan jual", async () => {
    const q = await chat(DEMO_EXAMPLES[3].text);
    expect(q.replies[0]).toContain("per *dus*");
    const r = await chat(DEMO_EXAMPLES[3].text, "2");
    expect(skus(r.state)).toEqual(["TPL-09×10", "PKU-BTN×2"]);
  });
});
