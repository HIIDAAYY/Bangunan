import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalogFromFile } from "@/lib/catalog";
import { createCatalogMatcher, normalize, unitGroup, type ExtractedItem, type MatchResult } from "@/lib/catalog-matcher";
import { compareOrder, toActual, type SampleOrder } from "@/lib/eval-scoring";

const catalog = loadCatalogFromFile();
const matcher = createCatalogMatcher(catalog);

function m(nama: string, satuan: string | null = null, qty = 1): MatchResult {
  return matcher.match({ nama, qty, satuan });
}

function skuOf(r: MatchResult): string | null {
  return r.status === "matched" ? r.product.sku : null;
}

function candidateSkus(r: MatchResult): string[] {
  return r.status === "ambiguous" ? r.candidates.map((c) => c.sku) : [];
}

describe("normalize", () => {
  it.each([
    ["Semen Tiga Roda 50KG", "semen tiga roda 50 kg"],
    ["hebel 7,5", "hebel 7.5"],
    ["spandek 0,30", "spandek 0.3"],
    ["granit 60x60", "granit 60 x 60"],
    ["pipa 3/4", "pipa 3/4"],
    ['pralon 3"', "pralon 3 dim"],
    ["triplek 12 mili", "triplek 12 mm"],
    ["MU-380", "mu 380"],
    ["pasir 2 kubik", "pasir 2 m3"],
    ["pasir 2 m³", "pasir 2 m3"],
    ["paralon ½ inch", "pralon 1/2 dim"],
  ])("%s → %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("unitGroup", () => {
  it("menyamakan sinonim satuan", () => {
    expect(unitGroup("Kubik")).toBe("m3");
    expect(unitGroup("pcs")).toBe(unitGroup("biji"));
    expect(unitGroup("unit")).toBe(unitGroup("biji"));
    expect(unitGroup("galon")).toBe(unitGroup("pail"));
    expect(unitGroup("zak")).toBe("sak");
  });
  it("null untuk satuan kosong/tidak dikenal", () => {
    expect(unitGroup(null)).toBeNull();
    expect(unitGroup("colt")).toBeNull();
  });
});

describe("match: exact & alias", () => {
  it.each([
    ["semen tiga roda", "SMN-TR-50"],
    ["Semen Tiga Roda 50kg", "SMN-TR-50"],
    ["TR 40", "SMN-TR-40"],
    ["besi 10 banci", "BSI-10-BCI"],
    ["hebel 10", "HBL-10-M3"],
    ["triplek 9", "TPL-09"],
    ["pralon 3 dim", "PPA-RCK-3"],
    ["pacul", "ALT-CGK"],
    ["usuk", "KYU-KSU-57"],
    ["kricak", "BTU-SPL-M3"],
  ])("%s → %s", (nama, sku) => {
    const r = m(nama);
    expect(skuOf(r)).toBe(sku);
    expect(r.status === "matched" && r.via).toBe("exact");
  });

  it("alias terpanjang menang saat beberapa alias terkandung", () => {
    expect(skuOf(m("besi beton 10 mm banci"))).toBe("BSI-10-BCI");
    expect(skuOf(m("besi beton 12 mm full SNI"))).toBe("BSI-12-SNI");
    expect(skuOf(m("besi beton 10 sni"))).toBe("BSI-10-SNI");
  });

  it("kata tambahan deskriptif tidak menggagalkan pencocokan", () => {
    expect(skuOf(m("cat tembok avitex putih"))).toBe("CAT-AVT-5");
    expect(skuOf(m("keramik platinum 40x40"))).toBe("KRM-PLT-40");
    expect(skuOf(m("granit 60x60 indogres"))).toBe("GRN-IDG-60");
  });
});

describe("match: typo", () => {
  it.each([
    ["smen tigaroda 50 kg", "SMN-TR-50"],
    ["semn gresik", "SMN-GR-40"],
    ["pasir psang", "PSR-PSG-M3"],
    ["trplek 12 mm", "TPL-12"],
    ["bendarat", "KWT-BDT"],
    ["katilak", "CAT-CTL-25"],
    ["grenit 60x60", "GRN-IDG-60"],
    ["pralon 4", "PPA-RCK-4"],
  ])("%s → %s", (nama, sku) => {
    expect(skuOf(m(nama))).toBe(sku);
  });
});

describe("match: angka spesifikasi", () => {
  it("ukuran menentukan varian", () => {
    expect(skuOf(m("semen tiga roda 40 kg"))).toBe("SMN-TR-40");
    expect(skuOf(m("semen tiga roda 50 kg"))).toBe("SMN-TR-50");
    expect(skuOf(m("bata ringan 7,5"))).toBe("HBL-075-M3");
    expect(skuOf(m("triplek 3 mili"))).toBe("TPL-03");
    expect(skuOf(m("paku 7 cm"))).toBe("PKU-7CM");
  });

  it("panjang batang (12 m) tidak dianggap ukuran besi", () => {
    expect(skuOf(m("besi 12 full"))).toBe("BSI-12-SNI");
  });

  it("varian yang tidak dijual → ambigu dengan saran varian yang ada", () => {
    const r = m("semen gresik 50 kg", "sak");
    expect(r.status).toBe("ambiguous");
    expect(r.status === "ambiguous" && r.reason).toBe("varian_tidak_ada");
    expect(candidateSkus(r)).toEqual(["SMN-GR-40"]);
  });
});

describe("match: satuan", () => {
  it("satuan memilih SKU saudara (pasir cor per rit vs per kubik)", () => {
    expect(skuOf(m("pasir cor", "rit"))).toBe("PSR-COR-RIT");
    expect(skuOf(m("pasir cor", "m3"))).toBe("PSR-COR-M3");
    expect(skuOf(m("pasir cor", null))).toBe("PSR-COR-M3");
  });

  it("satuan menyaring kandidat ambigu", () => {
    expect(candidateSkus(m("pasir", "rit"))).toEqual(["PSR-COR-RIT", "PSR-URG-RIT"]);
    expect(candidateSkus(m("paku", "kg"))).toEqual(["PKU-5CM", "PKU-7CM"]);
  });

  it("satuan yang tidak dijual dan tanpa SKU saudara → unit_mismatch", () => {
    const r = m("paku beton", "kg");
    expect(r.status).toBe("unit_mismatch");
    expect(r.status === "unit_mismatch" && r.product.sku).toBe("PKU-BTN");
  });

  it("satuan sinonim dianggap sama", () => {
    expect(skuOf(m("ember cor", "pcs"))).toBe("ALT-EMBR");
    expect(skuOf(m("gerobak sorong", "unit"))).toBe("ALT-GRB");
    expect(skuOf(m("cat catylac 25 kg", "galon"))).toBe("CAT-CTL-25");
  });
});

describe("match: ambigu & tidak ada", () => {
  it.each([
    ["hebel", "m3", ["HBL-075-M3", "HBL-10-M3"]],
    ["bata ringan", "m3", ["HBL-075-M3", "HBL-10-M3"]],
    ["besi 10", "batang", ["BSI-10-SNI", "BSI-10-BCI"]],
    ["cat tembok putih", "galon", ["CAT-AVT-5", "CAT-CTL-25"]],
  ])("%s → pilihan %j", (nama, satuan, skus) => {
    const r = m(nama, satuan);
    expect(r.status).toBe("ambiguous");
    expect(candidateSkus(r)).toEqual(skus);
  });

  it("maksimal 3 pilihan", () => {
    const r = m("semen", "sak");
    expect(r.status).toBe("ambiguous");
    expect(candidateSkus(r)).toHaveLength(3);
  });

  it.each(["closet duduk toto", "genteng keramik kanmuri", "semen putih", "kran air onda"])("%s → not_found", (nama) => {
    expect(m(nama).status).toBe("not_found");
  });

  it("teks tanpa kata barang → not_found", () => {
    expect(m("40 kg").status).toBe("not_found");
  });
});

describe("matchAmong (jawaban pertanyaan klarifikasi)", () => {
  const hebel = catalog.filter((p) => p.sku.startsWith("HBL-"));
  const besi10 = catalog.filter((p) => p.sku.startsWith("BSI-10-"));

  it("jawaban bebas digabung dengan teks item", () => {
    expect(matcher.matchAmong("hebel yang 10", hebel, "m3")?.sku).toBe("HBL-10-M3");
    expect(matcher.matchAmong("hebel 7,5", hebel, "m3")?.sku).toBe("HBL-075-M3");
    expect(matcher.matchAmong("besi 10 banci", besi10, "batang")?.sku).toBe("BSI-10-BCI");
    expect(matcher.matchAmong("besi 10 yang full", besi10, "batang")?.sku).toBe("BSI-10-SNI");
  });

  it("jawaban di luar kandidat → null", () => {
    expect(matcher.matchAmong("semen tiga roda", hebel, "sak")).toBeNull();
    expect(matcher.matchAmong("hebel", hebel, "m3")).toBeNull();
  });
});

describe("30 sample order dengan ekstraksi ideal", () => {
  const samples = JSON.parse(readFileSync("data/sample_orders.json", "utf-8")) as SampleOrder[];
  const ideal = JSON.parse(readFileSync("tests/fixtures/ideal-extractions.json", "utf-8")) as Record<
    string,
    [string, number, string | null][]
  >;

  it.each(samples.map((s) => [s.id, s.tingkat_kesulitan, s] as const))("#%i (%s)", (id, _level, sample) => {
    const items: ExtractedItem[] = ideal[String(id)].map(([nama, qty, satuan]) => ({ nama, qty, satuan }));
    const cmp = compareOrder(sample.expected, toActual(items.map(matcher.match)));
    expect(cmp.masalah).toEqual([]);
  });
});
