/** Identitas toko yang tampil di nota & simulator. Bisa diganti lewat env. */
export const TOKO = {
  nama: process.env.NEXT_PUBLIC_TOKO_NAMA ?? "Toko Bangunan Sumber Makmur",
  alamat: process.env.TOKO_ALAMAT ?? "Jl. Raya Narogong Km 8, Bekasi",
  telepon: process.env.TOKO_TELEPON ?? "0812-0000-0000",
};
