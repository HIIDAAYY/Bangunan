import twilio from "twilio";
import type { ExtractionInput } from "./order-parser";

/** Validasi header X-Twilio-Signature. `url` harus URL publik persis yang dipanggil Twilio. */
export function isValidTwilioSignature(opts: {
  authToken: string;
  signature: string | null;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!opts.signature) return false;
  return twilio.validateRequest(opts.authToken, opts.signature, opts.url, opts.params);
}

export type IncomingWhatsApp = {
  from: string; // "whatsapp:+62812..."
  phone: string; // "+62812..."
  body: string;
  messageSid: string;
  media: { url: string; contentType: string }[];
};

export function parseIncoming(params: Record<string, string>): IncomingWhatsApp {
  const numMedia = Number(params.NumMedia ?? 0);
  const media = Array.from({ length: numMedia }, (_, i) => ({
    url: params[`MediaUrl${i}`],
    contentType: params[`MediaContentType${i}`] ?? "",
  })).filter((m) => m.url);
  return {
    from: params.From ?? "",
    phone: (params.From ?? "").replace(/^whatsapp:/, ""),
    body: params.Body ?? "",
    messageSid: params.MessageSid ?? "",
    media,
  };
}

const SUPPORTED_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Unduh foto dari Twilio (butuh Basic Auth) sebagai base64 untuk Claude vision. */
export async function downloadImages(media: IncomingWhatsApp["media"]): Promise<NonNullable<ExtractionInput["images"]>> {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const images: NonNullable<ExtractionInput["images"]> = [];
  for (const m of media) {
    const type = m.contentType.split(";")[0].trim();
    if (!SUPPORTED_IMAGES.has(type)) continue;
    const res = await fetch(m.url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`Gagal mengunduh media Twilio: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) continue;
    images.push({ mediaType: type as NonNullable<ExtractionInput["images"]>[number]["mediaType"], base64: buf.toString("base64") });
  }
  return images;
}

/** WhatsApp membatasi 1600 karakter per pesan; pecah per baris. */
export function splitMessage(body: string, limit = 1500): string[] {
  if (body.length <= limit) return [body];
  const chunks: string[] = [];
  let current = "";
  for (const line of body.split("\n")) {
    if (current && current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line.slice(0, limit);
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendWhatsApp(to: string, body: string, mediaUrl?: string): Promise<void> {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    // Dev tanpa akun Twilio: tampilkan balasan di log saja.
    console.log(`[twilio dry-run] ke ${to}${mediaUrl ? ` (lampiran: ${mediaUrl})` : ""}\n${body}`);
    return;
  }
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const chunks = splitMessage(body);
  for (const [i, chunk] of chunks.entries()) {
    const isLast = i === chunks.length - 1;
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: chunk,
      ...(isLast && mediaUrl ? { mediaUrl: [mediaUrl] } : {}),
    });
  }
}
