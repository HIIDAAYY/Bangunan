import { after, NextResponse, type NextRequest } from "next/server";
import { publicBaseUrl } from "@/lib/nota-link";
import { processIncoming } from "@/lib/order-service";
import { downloadImages, isValidTwilioSignature, parseIncoming, sendWhatsApp } from "@/lib/twilio";

export const runtime = "nodejs";
// Ekstraksi Claude berjalan setelah respons dikirim (after), tapi tetap dalam durasi fungsi ini.
export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return new NextResponse("TWILIO_AUTH_TOKEN belum diset", { status: 500 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  // Di balik ngrok/Vercel, req.url bisa berbeda dari URL publik yang ditandatangani Twilio.
  const url = `${publicBaseUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!isValidTwilioSignature({ authToken, signature: req.headers.get("x-twilio-signature"), url, params })) {
    return new NextResponse("Signature Twilio tidak valid", { status: 403 });
  }

  const incoming = parseIncoming(params);
  if (!incoming.phone) return new NextResponse("From kosong", { status: 400 });

  // Balas Twilio segera (batas waktu webhook 15 detik); proses & kirim balasan lewat REST API.
  after(async () => {
    try {
      const images = incoming.media.length ? await downloadImages(incoming.media) : undefined;
      const result = await processIncoming({
        phone: incoming.phone,
        message: { text: incoming.body, images },
        messageSid: incoming.messageSid,
        sumber: "whatsapp",
      });
      for (const reply of result.replies) await sendWhatsApp(incoming.from, reply.body, reply.mediaUrl);
    } catch (err) {
      console.error("webhook: gagal memproses pesan", incoming.messageSid, err);
    }
  });

  return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
