/** 68000 -> "Rp68.000" */
export function formatRupiah(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp${digits}`;
}

/** 0.5 -> "0,5", 20 -> "20" */
export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100).replace(".", ",");
}

export const TIMEZONE = "Asia/Jakarta";

/** Rentang [awal, akhir) hari ini menurut WIB (UTC+7, tanpa DST). */
export function todayRangeWIB(now = new Date()): { start: Date; end: Date } {
  const offsetMs = 7 * 60 * 60 * 1000;
  const wib = new Date(now.getTime() + offsetMs);
  const startUtcMs = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - offsetMs;
  return { start: new Date(startUtcMs), end: new Date(startUtcMs + 24 * 60 * 60 * 1000) };
}

export function formatTanggalWaktu(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
