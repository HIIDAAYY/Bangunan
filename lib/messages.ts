/** Template balasan bot (Bahasa Indonesia, ramah & singkat, format WhatsApp). */
import { formatQty, formatRupiah } from "./format";

export type ProductRef = { sku: string; nama: string; satuan: string; harga: number };
export type DraftLine = ProductRef & { qty: number };
export type Draft = { lines: DraftLine[]; tidakTersedia: string[]; catatanPengiriman: string | null };

export type PendingQuestion =
  | {
      kind: "pilih";
      teks: string;
      nama: string;
      qty: number;
      satuan: string | null;
      reason: "banyak_pilihan" | "varian_tidak_ada" | "sebagian";
      candidates: ProductRef[];
    }
  | { kind: "jumlah"; teks: string; nama: string; qty: number; satuan: string | null; product: ProductRef };

export const lineSubtotal = (l: { qty: number; harga: number }) => Math.round(l.qty * l.harga);
export const draftTotal = (d: Draft) => d.lines.reduce((sum, l) => sum + lineSubtotal(l), 0);

export const HELP =
  "Halo! 👋 Silakan kirim daftar pesanan bahan bangunan di sini, bisa diketik atau foto catatan tulisan tangan.\n\n" +
  "Contoh: _semen tiga roda 20 sak, pasir cor 1 rit, kirim ke Jl. Melati 5_";

export const EXTRACTION_FAILED =
  "Maaf, pesan Anda belum berhasil kami baca karena sistem sedang gangguan. Mohon kirim ulang sebentar lagi ya 🙏";

export const NO_ITEMS =
  "Maaf, kami belum menemukan barang pesanan di pesan tersebut 🙏\n\n" +
  "Tulis nama barang dan jumlahnya, contoh: _semen tiga roda 20 sak_";

export const CANCELLED = "Baik, pesanan dibatalkan. Kirim daftar baru kapan saja ya 👍";

export const NOTHING_TO_REVISE =
  "Belum ada pesanan yang sedang menunggu konfirmasi, jadi belum ada yang bisa diubah. " +
  "Kirim daftar pesanan dulu ya, contoh: _semen tiga roda 20 sak, kirim ke Jl. Melati 5_";

export const ASK_REVISION ="Mau diubah apa? Contoh: _UBAH semen jadi 30 sak_ atau _UBAH alamat ke Jl. Mawar 3_";

export const CONFIRM_HINT = "Balas *YA* untuk konfirmasi, atau *UBAH ...* untuk revisi (contoh: _UBAH semen jadi 30 sak_).";

export function summary(draft: Draft): string {
  const lines = draft.lines.map(
    (l, i) =>
      `${i + 1}. ${l.nama}\n   ${formatQty(l.qty)} ${l.satuan} × ${formatRupiah(l.harga)} = *${formatRupiah(lineSubtotal(l))}*`,
  );
  const parts = ["📋 *Ringkasan Pesanan*", "", ...lines, "", `*Total: ${formatRupiah(draftTotal(draft))}*`];
  parts.push(
    draft.catatanPengiriman
      ? `🚚 Pengiriman: ${draft.catatanPengiriman}`
      : "🚚 Alamat kirim belum ada. Boleh ditambahkan lewat _UBAH alamat ..._",
  );
  if (draft.tidakTersedia.length) {
    parts.push("", `⚠️ Tidak tersedia di katalog kami: ${draft.tidakTersedia.join(", ")}`);
  }
  parts.push("", CONFIRM_HINT);
  return parts.join("\n");
}

export function question(q: PendingQuestion): string {
  if (q.kind === "jumlah") {
    const p = q.product;
    return (
      `❓ *${q.teks}*: ${p.nama} kami jual per *${p.satuan}* (${formatRupiah(p.harga)}/${p.satuan}).\n` +
      `Mau berapa ${p.satuan}? Balas angkanya, atau 0 untuk menghapus item ini.`
    );
  }
  const intro = {
    banyak_pilihan: `❓ Untuk *${q.teks}*, maksudnya yang mana?`,
    varian_tidak_ada: `❓ *${q.teks}* tidak tersedia. Yang ada:`,
    sebagian: `❓ Kami tidak menemukan *${q.teks}* persis. Mungkin maksudnya:`,
  }[q.reason];
  const options = q.candidates.map((c, i) => `${i + 1}. ${c.nama} (${formatRupiah(c.harga)}/${c.satuan})`);
  return [intro, ...options, "0. Hapus item ini", "", "Balas dengan nomornya ya."].join("\n");
}

export function invalidAnswer(q: PendingQuestion): string {
  return q.kind === "jumlah"
    ? "Mohon balas dengan angka jumlahnya ya (contoh: 3), atau 0 untuk menghapus item ini."
    : `Mohon balas dengan nomor pilihan (1–${q.candidates.length}), atau 0 untuk menghapus item ini.`;
}

export function notAvailable(items: string[]): string {
  return `⚠️ Maaf, ${items.join(", ")} tidak tersedia di katalog kami.`;
}

export function orderCreated(order: { id: number; total: number }): string {
  return (
    `✅ Pesanan *#${order.id}* sudah kami terima, total *${formatRupiah(order.total)}*.\n` +
    "Nota PDF terlampir. Tim kami segera memproses pesanan Anda. Terima kasih! 🙏"
  );
}
