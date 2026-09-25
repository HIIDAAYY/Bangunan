import { PrismaClient } from "@prisma/client";
import { loadCatalogFromFile } from "../lib/catalog";

const prisma = new PrismaClient();

async function main() {
  const catalog = loadCatalogFromFile();
  for (const [urutan, p] of catalog.entries()) {
    const data = { nama: p.nama, kategori: p.kategori, satuan: p.satuan, harga: p.harga, alias: p.alias, aktif: true, urutan };
    await prisma.product.upsert({ where: { sku: p.sku }, create: { sku: p.sku, ...data }, update: data });
  }
  // Produk yang dihapus dari catalog.json dinonaktifkan, bukan dihapus (bisa masih dirujuk order_items).
  const { count } = await prisma.product.updateMany({
    where: { sku: { notIn: catalog.map((p) => p.sku) } },
    data: { aktif: false },
  });
  console.log(`Seed selesai: ${catalog.length} produk di-upsert, ${count} dinonaktifkan.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
