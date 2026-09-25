/**
 * Contoh chat untuk demo publik (EXTRACTOR=heuristik, tanpa AI).
 * Parser heuristik hanya memahami format "<barang> <jumlah> <satuan>", jadi contoh di sini
 * sengaja berformat sederhana. Diuji di tests/demo-examples.test.ts agar tidak rusak diam-diam.
 */
export const DEMO_EXAMPLES: { label: string; text: string }[] = [
  { label: "Pesanan dengan item ambigu", text: "semen tiga roda 20 sak, hebel 3 kubik, kirim ke Jl. Melati 5" },
  { label: "Besi full atau banci?", text: "besi 10 50 batang, semen gresik 10 sak, kirim ke proyek Cibubur" },
  { label: "Barang tidak ada di katalog", text: "pasir cor 1 rit, batu split 2 kubik, closet toto 1 unit, kirim ke Jl. Mawar 3" },
  { label: "Satuan berbeda", text: "paku beton 2 kg, triplek 9 mm 10 lembar, kirim ke Jl. Kenanga 12" },
];

/** Balasan cepat setelah ringkasan muncul. */
export const DEMO_FOLLOW_UPS = ["UBAH semen jadi 30", "YA"];
