import type { OrderStatus } from "@prisma/client";

export const STATUS_FLOW: OrderStatus[] = ["BARU", "DIPROSES", "DIKIRIM", "SELESAI"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  BARU: "Baru",
  DIPROSES: "Diproses",
  DIKIRIM: "Dikirim",
  SELESAI: "Selesai",
};

/** Label tombol untuk memindahkan order ke status berikutnya. */
export const NEXT_ACTION: Record<OrderStatus, string | null> = {
  BARU: "Proses pesanan",
  DIPROSES: "Tandai dikirim",
  DIKIRIM: "Tandai selesai",
  SELESAI: null,
};

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  return STATUS_FLOW[i + 1] ?? null;
}

export const STATUS_STYLE: Record<OrderStatus, string> = {
  BARU: "bg-rambu text-tinta",
  DIPROSES: "bg-proses text-white",
  DIKIRIM: "bg-kirim text-white",
  SELESAI: "bg-selesai text-white",
};
