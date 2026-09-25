/** Membandingkan hasil parsing dengan `expected` di data/sample_orders.json. Modul murni. */
import type { MatchResult } from "./catalog-matcher";

export type ExpectedEntry = { sku: string; qty: number } | { ambigu: true; teks: string; alasan?: string };

export type SampleOrder = {
  id: number;
  pesan: string;
  expected: ExpectedEntry[];
  catatan_pengiriman: string | null;
  tingkat_kesulitan: "mudah" | "sedang" | "sulit";
};

export type ActualEntry = { sku: string; qty: number } | { ambigu: true; teks: string; status: string };

export function toActual(results: MatchResult[]): ActualEntry[] {
  return results.map((r) =>
    r.status === "matched"
      ? { sku: r.product.sku, qty: r.item.qty }
      : { ambigu: true as const, teks: r.item.teks_asli ?? r.item.nama, status: r.status },
  );
}

export type Comparison = {
  pass: boolean;
  itemsBenar: number; // SKU + qty tepat
  itemsExpected: number; // jumlah item ber-SKU di expected
  itemsActual: number; // jumlah item ber-SKU di hasil
  ambiguExpected: number;
  ambiguActual: number;
  masalah: string[];
};

const keyOf = (e: { sku: string; qty: number }) => `${e.sku}×${e.qty}`;

export function compareOrder(expected: ExpectedEntry[], actual: ActualEntry[]): Comparison {
  const expItems = expected.filter((e): e is { sku: string; qty: number } => "sku" in e);
  const actItems = actual.filter((e): e is { sku: string; qty: number } => "sku" in e);
  const ambiguExpected = expected.length - expItems.length;
  const ambiguActual = actual.length - actItems.length;

  const remaining = actItems.map(keyOf);
  const masalah: string[] = [];
  let itemsBenar = 0;
  for (const e of expItems) {
    const i = remaining.indexOf(keyOf(e));
    if (i >= 0) {
      itemsBenar++;
      remaining.splice(i, 1);
    } else {
      const sameSku = actItems.find((a) => a.sku === e.sku);
      masalah.push(sameSku ? `qty ${e.sku}: diharapkan ${e.qty}, dapat ${sameSku.qty}` : `hilang: ${keyOf(e)}`);
    }
  }
  for (const r of remaining) {
    const sku = r.split("×")[0];
    if (!expItems.some((e) => e.sku === sku)) masalah.push(`tidak diharapkan: ${r}`);
  }
  if (ambiguExpected !== ambiguActual) {
    masalah.push(`jumlah item ambigu: diharapkan ${ambiguExpected}, dapat ${ambiguActual}`);
  }

  return {
    pass: masalah.length === 0,
    itemsBenar,
    itemsExpected: expItems.length,
    itemsActual: actItems.length,
    ambiguExpected,
    ambiguActual,
    masalah,
  };
}
