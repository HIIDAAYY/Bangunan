import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { processIncoming } from "@/lib/order-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  phone: z.string().min(3).max(40),
  text: z.string().max(4000).default(""),
  image: z
    .object({
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      base64: z.string().max(7_000_000),
    })
    .optional(),
});

/** Simulator chat: alur sama persis dengan webhook WhatsApp, tapi balasan dikembalikan langsung. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });

  const { phone, text, image } = parsed.data;
  const result = await processIncoming({
    phone: `sim:${phone}`,
    message: { text, images: image ? [image] : undefined },
    sumber: "simulator",
  });
  return NextResponse.json(result);
}

/** Reset percakapan simulator (mulai dari awal). */
export async function DELETE(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone wajib" }, { status: 400 });
  await prisma.conversation.deleteMany({ where: { phone: `sim:${phone}` } });
  return NextResponse.json({ ok: true });
}
