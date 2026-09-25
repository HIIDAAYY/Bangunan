# Checklist deploy demo publik (Vercel + Supabase)

Target: `/simulator` bisa dicoba siapa saja **tanpa login dan tanpa biaya API** (`EXTRACTOR=heuristik`),
sementara `/dashboard` tetap dilindungi password. Semua langkah di bawah dikerjakan dari akunmu sendiri.

Perkiraan waktu: 30–45 menit.

## 1. GitHub

- [ ] Buat repo baru di GitHub (boleh private dulu).
- [ ] Commit semua file lalu push. Pastikan `.env` dan `.env.bak-*` **tidak** ikut. Keduanya sudah di-ignore;
      cek dengan `git status` sebelum commit.
- [ ] Buka tab **Actions** dan pastikan workflow **CI** hijau (lint, typecheck, unit test, E2E).

## 2. Supabase (database)

- [ ] Daftar di <https://supabase.com> lalu **New project**. Pilih region **Southeast Asia (Singapore)** dan simpan
      password database.
- [ ] Buka **Connect** (tombol di atas dashboard project), lalu salin dua connection string:
  - **Transaction pooler** (port **6543**) → untuk `DATABASE_URL`. Tambahkan `?pgbouncer=true&connection_limit=1`
    di akhir URL.
  - **Session pooler** (port **5432**) → untuk `DIRECT_URL` (dipakai migrasi).
- [ ] Buat tabel dan isi katalog dari laptop (PowerShell, di folder proyek):

  ```powershell
  $env:DATABASE_URL="<transaction pooler URL>?pgbouncer=true&connection_limit=1"
  $env:DIRECT_URL="<session pooler URL>"
  npx prisma migrate deploy
  npx tsx prisma/seed.ts
  ```

  Hasil yang diharapkan: `All migrations have been successfully applied` dan `Seed selesai: 50 produk`.
- [ ] Di **Table Editor**, pastikan tabel `products` berisi 50 baris.

## 3. Vercel (aplikasi)

- [ ] Daftar di <https://vercel.com> dengan akun GitHub, lalu **Add New → Project** dan import repo tadi.
      Framework terdeteksi otomatis sebagai Next.js. Build command sudah diatur di `package.json`.
- [ ] Isi **Environment Variables** sebelum klik Deploy:

  | Nama | Nilai |
  |---|---|
  | `EXTRACTOR` | `heuristik` (wajib; inilah yang membuat simulator publik dan gratis) |
  | `DATABASE_URL` | transaction pooler URL + `?pgbouncer=true&connection_limit=1` |
  | `DIRECT_URL` | session pooler URL |
  | `DASHBOARD_PASSWORD` | password kuat baru. **Jangan pakai `demo123`** |
  | `APP_SECRET` | string acak panjang, mis. hasil `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
  | `PUBLIC_BASE_URL` | isi sementara `https://example.com`, diganti di langkah berikutnya |

  Jangan isi `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, atau kredensial Twilio untuk demo publik.
- [ ] Klik **Deploy**. Setelah selesai, salin domain-nya (mis. `https://asisten-pesanan.vercel.app`).
- [ ] Ganti `PUBLIC_BASE_URL` dengan domain tersebut (tanpa `/` di akhir), lalu **Redeploy**.
      Variabel ini dipakai untuk link nota PDF.
- [ ] **Settings → Functions → Function Region**: pilih **Singapore (sin1)** agar dekat dengan database, lalu Redeploy.

## 4. Verifikasi setelah deploy

Buka di jendela incognito:

- [ ] `/simulator` terbuka **tanpa** diminta login, dengan kotak kuning "Ini demo publik tanpa AI".
- [ ] Klik contoh "Pesanan dengan item ambigu" → jawab `2` → klik `UBAH semen jadi 30` → klik `YA`.
      Balasan terakhir memuat "Nota pesanan", dan link PDF-nya bisa dibuka.
- [ ] `/dashboard` **meminta login**. Login dengan `admin` / `DASHBOARD_PASSWORD`, lalu pastikan pesanan tadi muncul
      dan tombol **Proses pesanan** berfungsi.
- [ ] Ganti link demo di `README.md` (cari `YOUR-DEMO-URL`) dengan domain Vercel-mu, commit, lalu push.

## 5. Perawatan

- **Bersihkan data demo** sesekali (pengunjung bisa membuat pesanan). Di Supabase → SQL Editor:

  ```sql
  truncate order_items, orders, customers, conversations restart identity cascade;
  ```

- **Supabase gratis akan dipause** kalau tidak dipakai sekitar seminggu, dan link demo jadi error. Sebelum mengirim
  link ke perekrut/klien, buka dashboard Supabase dan klik **Restore** kalau project sedang dipause.
- **Vercel Hobby** ditujukan untuk pemakaian pribadi/non-komersial. Kalau demo ini dipakai untuk klien berbayar,
  pertimbangkan paket Pro.
- **Mengaktifkan AI di deployment** (nanti): set `EXTRACTOR=claude` + `ANTHROPIC_API_KEY`. Simulator **otomatis ikut
  terkunci password** karena middleware hanya membukanya untuk `heuristik`, jadi kredit API tidak bisa dihabiskan
  pengunjung.
- **WhatsApp sungguhan**: isi `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, lalu atur webhook
  sandbox ke `https://<domain>/api/whatsapp/webhook` (lihat README → Run locally).
