import { NextResponse, type NextRequest } from "next/server";

/**
 * Akses halaman:
 * - Mode demo (EXTRACTOR=heuristik): simulator DAN dashboard terbuka untuk siapa saja yang punya link.
 *   Aman karena tidak ada biaya API dan datanya hanya pesanan simulasi.
 * - Mode AI (claude/openrouter): simulator & dashboard dilindungi HTTP Basic Auth
 *   (username: admin, password: DASHBOARD_PASSWORD) agar kredit API dan data pelanggan asli tidak terbuka.
 * Webhook Twilio dan link nota punya verifikasi sendiri (signature / token), jadi tidak ikut di sini.
 */
export function isPublicDemo(extractor = process.env.EXTRACTOR): boolean {
  return extractor === "heuristik";
}

export function middleware(req: NextRequest) {
  if (isPublicDemo()) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Halaman ini dikunci: DASHBOARD_PASSWORD belum diset di server. Untuk demo publik tanpa login, set EXTRACTOR=heuristik.",
        { status: 503 },
      );
    }
    return NextResponse.next(); // dev lokal tanpa password
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pass] = atob(encoded).split(":");
    if (user === "admin" && pass === password) return NextResponse.next();
  }
  return new NextResponse("Login diperlukan", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dashboard Toko", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/dashboard/:path*", "/simulator/:path*", "/api/simulator/:path*"],
};
