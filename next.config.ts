import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ada package-lock.json lain di folder induk; tetapkan root proyek secara eksplisit.
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // @react-pdf/renderer dijalankan di server sebagai paket Node biasa.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
