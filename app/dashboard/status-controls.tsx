import type { OrderStatus } from "@prisma/client";
import { NEXT_ACTION, nextStatus } from "@/lib/order-status";
import { updateOrderStatus } from "./actions";

/** Tombol untuk memindahkan order ke status berikutnya (server action, tanpa JS di klien). */
export function AdvanceButton({ orderId, status, className = "" }: { orderId: number; status: OrderStatus; className?: string }) {
  const next = nextStatus(status);
  if (!next) return null;
  return (
    <form action={updateOrderStatus}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="status" value={next} />
      <button
        type="submit"
        className={`rounded-md bg-tinta px-3 py-2 text-sm font-semibold text-panel hover:bg-black ${className}`}
      >
        {NEXT_ACTION[status]}
      </button>
    </form>
  );
}
