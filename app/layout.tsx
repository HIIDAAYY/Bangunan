import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Asisten Pesanan Toko Bangunan",
  description: "Pesanan WhatsApp diubah otomatis menjadi order, lengkap dengan nota.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${archivo.variable} antialiased`}>{children}</body>
    </html>
  );
}
