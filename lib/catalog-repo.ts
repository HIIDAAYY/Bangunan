import type { CatalogProduct } from "./catalog";
import { createCatalogMatcher, type CatalogMatcher } from "./catalog-matcher";
import { prisma } from "./db";

const TTL_MS = 60_000;
let cache: { at: number; catalog: CatalogProduct[]; matcher: CatalogMatcher } | null = null;

/** Katalog produk aktif dari DB + matcher-nya, di-cache 60 detik per proses. */
export async function getCatalog(): Promise<{ catalog: CatalogProduct[]; matcher: CatalogMatcher }> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  // Urutan katalog menentukan urutan pilihan saat item ambigu.
  const rows = await prisma.product.findMany({ where: { aktif: true }, orderBy: [{ urutan: "asc" }, { sku: "asc" }] });
  const catalog: CatalogProduct[] = rows.map((r) => ({
    sku: r.sku,
    nama: r.nama,
    kategori: r.kategori,
    satuan: r.satuan,
    harga: r.harga,
    alias: r.alias,
  }));
  cache = { at: Date.now(), catalog, matcher: createCatalogMatcher(catalog) };
  return cache;
}
