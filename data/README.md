# Data Demo: Asisten Pesanan WhatsApp Toko Bangunan

Data sintetis untuk demo parsing pesanan WhatsApp ke item katalog. Harga adalah perkiraan pasar Jabodetabek 2026, bukan harga resmi.

## `catalog.json`: 50 produk

| Field | Tipe | Keterangan |
|---|---|---|
| `sku` | string | Kode unik produk, contoh `SMN-TR-50` |
| `nama` | string | Nama resmi produk |
| `kategori` | string | Salah satu dari: Semen, Pasir/Batu, Besi Beton, Bata/Hebel, Kayu/Triplek, Cat, Pipa & Fitting, Keramik, Baja Ringan, Paku/Baut, Alat |
| `satuan` | string | Satuan jual: `sak`, `m3`, `rit`, `batang`, `kg`, `biji`, `lembar`, `galon`, `pail`, `kaleng`, `pcs`, `dus`, `bungkus`, `meter`, `unit` |
| `harga` | integer | Harga per satuan, dalam Rupiah |
| `alias` | string[] | Sebutan sehari-hari, singkatan, dan salah ketik yang biasa dipakai tukang/mandor |

Catatan:
- Setiap alias hanya dipakai oleh satu produk. Sebutan yang umum dipakai untuk lebih dari satu produk sengaja tidak dijadikan alias, misalnya "besi 10" (bisa full SNI atau banci), "hebel" (7,5 atau 10 cm), "paku", dan "pasir". Kalau pelanggan hanya menulis sebutan seperti itu, asisten harus bertanya ulang.
- "tiga roda" tanpa ukuran dianggap Semen Tiga Roda 50kg, karena itu ukuran yang paling sering dipesan.
- Pasir cor dan pasir urug dijual per **rit** (satu truk engkel, sekitar 7 m³). Pasir cor, pasir pasang, batu split, batu kali, dan hebel dijual per **m3** (kubik). Kalau pelanggan menulis "setengah kubik", jumlahnya `0.5`.

## `sample_orders.json`: 30 contoh chat

| Field | Tipe | Keterangan |
|---|---|---|
| `id` | integer | Nomor contoh |
| `pesan` | string | Teks chat asli. Percakapan dengan beberapa pesan ditulis dengan penanda jam `[hh.mm]` dan dipisah baris baru |
| `expected` | array | Hasil ekstraksi yang benar, dalam keadaan **akhir** setelah semua koreksi di chat diterapkan |
| `catatan_pengiriman` | string \| null | Alamat atau instruksi pengiriman. Nilainya `null` kalau pelanggan tidak menyebutkannya |
| `tingkat_kesulitan` | `mudah` \| `sedang` \| `sulit` | Perkiraan tingkat kesulitan parsing |

Isi `expected` ada dua bentuk:

```json
{ "sku": "SMN-TR-50", "qty": 20 }
{ "ambigu": true, "teks": "hebel 3 kubik", "alasan": "tebal hebel tidak disebut" }
```

Bentuk kedua dipakai untuk item yang ambigu atau tidak ada di katalog. `teks` berisi potongan pesan yang perlu ditanyakan ulang ke pelanggan, dan `alasan` menjelaskan kenapa item itu tidak bisa langsung dipetakan ke SKU.

Contoh chat mencakup berbagai variasi:
- Gaya bahasa formal, singkat, Jawa, Sunda, Betawi, banyak salah ketik, dan tanpa tanda baca.
- Format satu baris, daftar bernomor, dan beberapa pesan terpisah.
- Jumlah ditulis dengan huruf ("dua puluh lima", "selusin", Jawa "patang puluh").
- Satuan berbeda ("1 rit", "setengah kubik").
- Item ambigu, item yang tidak ada di katalog, dan koreksi pesanan ("yang semen tadi jadi 30 aja", "nat nya ga jadi").

## Validasi

```bash
python scripts/validate_data.py
```

Script ini memeriksa jumlah data, keunikan SKU dan alias, kategori, harga, serta memastikan setiap `sku` di `expected` ada di katalog.
