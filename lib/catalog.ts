import { readFileSync } from "node:fs";
import path from "node:path";

export type CatalogProduct = {
  sku: string;
  nama: string;
  kategori: string;
  satuan: string;
  harga: number;
  alias: string[];
};

export function loadCatalogFromFile(file = path.resolve(process.cwd(), "data/catalog.json")): CatalogProduct[] {
  return JSON.parse(readFileSync(file, "utf-8")) as CatalogProduct[];
}
