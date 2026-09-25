import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ada package-lock.json lain di folder induk; tetapkan root proyek secara eksplisit.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // @react-pdf/renderer dijalankan di server sebagai paket Node biasa.
  serverExternalPackages: ["@react-pdf/renderer"],
  // pdfkit memuat font standar (Helvetica, dll.) secara dinamis, sehingga tidak terdeteksi file tracing
  // dan hilang di Vercel ("Cannot find module .../standard-fonts/Helvetica.cjs"). Sertakan secara eksplisit.
  outputFileTracingIncludes: {
    "/api/nota/[id]": ["./node_modules/pdfkit/js/standard-fonts/**/*", "./node_modules/pdfkit/js/data/**/*"],
  },
};

export default nextConfig;
