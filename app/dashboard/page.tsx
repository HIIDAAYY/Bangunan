import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatRupiah, TIMEZONE, todayRangeWIB } from "@/lib/format";
import { STATUS_FLOW, STATUS_LABEL, STATUS_STYLE } from "@/lib/order-status";
import { AdvanceButton } from "./status-controls";

export const dynamic = "force-dynamic";

const jam = new Intl.DateTimeFormat("id-ID", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
const tanggal = new Intl.DateTimeFormat("id-ID", { timeZone: TIMEZONE, weekday: "long", day: "numeric", month: "long" });

export default async function DashboardPage() {
  const { start, end } = todayRangeWIB();
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { customer: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
  });
  const omzet = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-tinta pb-5">
        <div>
          <p className="text-redup">{tanggal.format(new Date())}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            <span className="angka" data-testid="jumlah-pesanan">{orders.length}</span> pesanan hari ini, omzet{" "}
            <span className="angka whitespace-nowrap" data-testid="omzet">{formatRupiah(omzet)}</span>
          </h1>
        </div>
        <Link href="/simulator" className="text-sm font-semibold underline underline-offset-4 hover:no-underline">
          Buka simulator chat
        </Link>
      </header>

      {orders.length === 0 ? (
        <p className="mt-16 max-w-md text-lg text-redup">
          Belum ada pesanan hari ini. Pesanan yang dikonfirmasi pelanggan lewat WhatsApp akan muncul di sini.
        </p>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {STATUS_FLOW.map((status) => {
            const list = orders.filter((o) => o.status === status);
            return (
              <section key={status} aria-labelledby={`kolom-${status}`} data-testid={`kolom-${status}`}>
                <h2 id={`kolom-${status}`} className="flex items-center gap-2 text-lg font-bold">
                  <span className={`inline-block h-3 w-3 rounded-full ${STATUS_STYLE[status].split(" ")[0]}`} aria-hidden />
                  {STATUS_LABEL[status]}
                  <span className="angka font-normal text-redup">{list.length}</span>
                </h2>
                {list.length === 0 && (
                  <p className="mt-3 rounded-md border border-dashed border-garis px-4 py-6 text-sm text-redup">
                    Tidak ada pesanan {STATUS_LABEL[status].toLowerCase()}.
                  </p>
                )}
                <ul className="mt-3 space-y-3">
                  {list.map((o) => (
                    <li
                      key={o.id}
                      data-testid={`order-${o.id}`}
                      className={`rounded-md border border-garis bg-panel p-4 ${status === "BARU" ? "border-l-4 border-l-rambu" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <Link href={`/dashboard/orders/${o.id}`} className="text-lg font-bold hover:underline">
                          Pesanan #{o.id}
                        </Link>
                        <span className="angka text-sm text-redup">{jam.format(o.createdAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-redup">{o.customer.name ?? o.customer.phone}</p>
                      <p className="mt-3 flex items-baseline justify-between">
                        <span className="text-sm">{o._count.items} barang</span>
                        <span className="angka text-lg font-bold">{formatRupiah(o.total)}</span>
                      </p>
                      {o.catatanPengiriman && <p className="mt-2 line-clamp-2 text-sm">{o.catatanPengiriman}</p>}
                      <AdvanceButton orderId={o.id} status={o.status} className="mt-4 w-full" />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
