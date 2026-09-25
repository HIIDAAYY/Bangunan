import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.APP_SECRET;
  if (!s) throw new Error("APP_SECRET belum diset");
  return s;
}

export function signNota(orderId: number): string {
  return createHmac("sha256", secret()).update(`nota:${orderId}`).digest("base64url").slice(0, 32);
}

export function verifyNota(orderId: number, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(signNota(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** URL publik nota PDF (dipakai Twilio untuk mengunduh lampiran). */
export function notaUrl(orderId: number): string {
  return `${publicBaseUrl()}/api/nota/${orderId}?t=${signNota(orderId)}`;
}
