import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth (username: admin, password: DASHBOARD_PASSWORD).
 * - Dashboard selalu dilindungi.
 * - Simulator terbuka untuk publik HANYA bila EXTRACTOR=heuristik (tanpa biaya API). Dengan provider AI,
 *   simulator ikut dikunci agar pengunjung tidak bisa menghabiskan kredit API.
 * Webhook Twilio dan link nota punya verifikasi sendiri (signature / token), jadi tidak ikut di sini.
 */
export function isPublicPath(pathname: string, extractor = process.env.EXTRACTOR): boolean {
  const isSimulator = pathname === "/simulator" || pathname.startsWith("/simulator/") || pathname.startsWith("/api/simulator");
  return isSimulator && extractor === "heuristik";
}

export function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("DASHBOARD_PASSWORD belum diset", { status: 503 });
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
