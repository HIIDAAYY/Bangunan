import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatQty, formatRupiah, formatTanggalWaktu } from "@/lib/format";
import { notaUrl } from "@/lib/nota-link";
import { STATUS_FLOW, STATUS_LABEL, STATUS_STYLE } from "@/lib/order-status";
import { updateOrderStatus } from "../../actions";
import { AdvanceButton } from "../../status-controls";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, customer: true } });
  if (!order) notFound();

  const current = STATUS_FLOW.indexOf(order.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-4 hover:no-underline">
        Kembali ke papan pesanan
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pesanan #{order.id}</h1>
          <p className="mt-1 text-redup">
            {formatTanggalWaktu(order.createdAt)}, dari {order.sumber === "simulator" ? "simulator" : "WhatsApp"}
          </p>
        </div>
        <span data-testid="status-saat-ini" className={`rounded-md px-3 py-1.5 font-bold ${STATUS_STYLE[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </header>

      {/* Alur status adalah urutan nyata, jadi ditampilkan bernomor. */}
      <ol className="mt-6 grid grid-cols-4 gap-1 text-center text-sm" aria-label="Alur status">
        {STATUS_FLOW.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? "step" : undefined}
            className={`border-t-4 pt-2 ${i <= current ? "border-tinta font-semibold" : "border-garis text-redup"}`}
          >
            {i + 1}. {STATUS_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AdvanceButton orderId={order.id} status={order.status} />
        <form action={updateOrderStatus} className="flex items-center gap-2">
          <input type="hidden" name="orderId" value={order.id} />
          <label htmlFor="status" className="text-sm text-redup">
            Koreksi status
          </label>
          <select
            // key: select tak terkontrol tidak ikut berubah setelah server action; paksa render ulang saat status berubah.
            key={order.status}
            id="status"
            name="status"
            defaultValue={order.status}
            className="rounded-md border border-garis bg-panel px-2 py-2 text-sm"
          >
            {STATUS_FLOW.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border-2 border-tinta px-3 py-1.5 text-sm font-semibold hover:bg-panel">
            Simpan
          </button>
        </form>
      </div>

      <section className="mt-8 rounded-md border border-garis bg-panel">
        <dl className="grid gap-4 border-b border-dashed border-garis p-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-redup">Pelanggan</dt>
            <dd className="font-semibold">{order.customer.name ?? order.customer.phone}</dd>
          </div>
          <div>
            <dt className="text-sm text-redup">Pengiriman</dt>
            <dd className="font-semibold">{order.catatanPengiriman ?? "Belum ada alamat"}</dd>
          </div>
        </dl>

        <table className="w-full text-left">
          <caption className="sr-only">Barang yang dipesan</caption>
          <thead className="text-sm text-redup">
            <tr>
              <th className="px-5 py-3 font-normal">Barang</th>
              <th className="px-3 py-3 text-right font-normal">Jumlah</th>
              <th className="hidden px-3 py-3 text-right font-normal sm:table-cell">Harga</th>
              <th className="px-5 py-3 text-right font-normal">Subtotal</th>
            </tr>
          </thead>
          <tbody className="angka">
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-garis">
                <td className="px-5 py-3">
                  {item.nama}
                  <span className="block text-xs text-redup">{item.sku}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  {formatQty(item.qty)} {item.satuan}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-right sm:table-cell">{formatRupiah(item.hargaSatuan)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right font-semibold">{formatRupiah(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-tinta">
              <td colSpan={2} className="px-5 py-4 font-bold sm:hidden">
                Total
              </td>
              <td colSpan={3} className="hidden px-5 py-4 font-bold sm:table-cell">
                Total
              </td>
              <td className="angka whitespace-nowrap px-5 py-4 text-right text-xl font-extrabold" data-testid="total">
                {formatRupiah(order.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <a href={notaUrl(order.id)} target="_blank" rel="noopener" className="mt-5 inline-block font-semibold underline underline-offset-4 hover:no-underline">
        Unduh nota PDF
      </a>
    </main>
  );
}
