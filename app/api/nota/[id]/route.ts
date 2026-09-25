import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyNota } from "@/lib/nota-link";
import { renderNotaPdf } from "@/lib/nota-pdf";

export const runtime = "nodejs";

/**
 * Nota PDF. Diakses Twilio (untuk lampiran WhatsApp) dan dashboard, sehingga dilindungi token
 * HMAC di URL (?t=...) alih-alih login — ID order yang berurutan tidak bisa ditebak-tebak.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !verifyNota(id, req.nextUrl.searchParams.get("t"))) {
    return new NextResponse("Link nota tidak valid", { status: 403 });
  }
  const order = await prisma.order.findUnique({ where: { id }, include: { items: { orderBy: { id: "asc" } }, customer: true } });
  if (!order) return new NextResponse("Pesanan tidak ditemukan", { status: 404 });

  const pdf = await renderNotaPdf(order);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="nota-${id}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
