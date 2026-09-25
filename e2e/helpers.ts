import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** Membuat order hari ini langsung di DB (tanpa lewat chat) untuk menguji dashboard. */
export async function createTestOrder() {
  const phone = `+62899${Date.now().toString().slice(-8)}`;
  const customer = await prisma.customer.create({ data: { phone, name: `Pelanggan E2E ${phone.slice(-4)}` } });
  return prisma.order.create({
    data: {
      customerId: customer.id,
      catatanPengiriman: "Proyek E2E, Jl. Uji Coba 1",
      total: 68_000 * 10 + 64_000 * 5,
      items: {
        create: [
          { sku: "SMN-TR-50", nama: "Semen Tiga Roda 50kg", satuan: "sak", qty: 10, hargaSatuan: 68_000, subtotal: 680_000 },
          { sku: "BSI-08-SNI", nama: "Besi Beton 8mm Full SNI 12m", satuan: "batang", qty: 5, hargaSatuan: 64_000, subtotal: 320_000 },
        ],
      },
    },
  });
}
