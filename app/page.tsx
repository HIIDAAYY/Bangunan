import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
        Pesanan WhatsApp masuk, langsung jadi order.
      </h1>
      <p className="mt-5 max-w-prose text-lg leading-relaxed text-redup">
        Pelanggan cukup mengetik atau memfoto daftar belanja. Asisten mencocokkan barangnya ke katalog, menghitung
        total, meminta konfirmasi, lalu mengirim nota PDF.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/dashboard" className="rounded-md bg-tinta px-5 py-3 font-semibold text-panel hover:bg-black">
          Buka dashboard toko
        </Link>
        <Link
          href="/simulator"
          className="rounded-md border-2 border-tinta px-5 py-3 font-semibold hover:bg-panel"
        >
          Coba simulator chat
        </Link>
      </div>
    </main>
  );
}
