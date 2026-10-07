# Nalaro Mail Desk

Mailbox internal tersedia di **Project Desk → Email**, URL `/admin/email`.

Alur layanan:

- Email masuk: internet → Cloudflare Email Routing → handler `email()` pada Worker → R2 privat.
- Email keluar: Mail Desk → API Worker dengan token Firebase admin → Resend → penerima.
- Login memakai akun Firebase admin yang sudah ada. Gmail tidak diperlukan dalam alur ini.
- Frontend tetap Astro statis di Cloudflare Pages. Satu Worker terpisah melayani penerimaan email dan API mailbox; bucket R2 diakses melalui binding, bukan API key browser.

## Template email Nalaro

Branding otomatis ditentukan oleh alamat pengirim pada Worker:

| Pengirim | Tampilan |
| --- | --- |
| `hello@nalaro.digital` | Client conversation, banner, footer Nalaro |
| `business@nalaro.digital` | Business & partnerships, banner, footer Nalaro Business |
| `billing@nalaro.digital` | Billing update; invoice/receipt menampilkan ringkasan dokumen, nominal, status, tanggal, dan tautan verifikasi |
| `admin@nalaro.digital` | Teks asli, tanpa template branding |
| `khoirululum@nalaro.digital` | Teks asli, tanpa template branding |

Template bersama berada di `src/lib/email-template.js`. Semua teks dinamis di-escape; HTML dari editor tidak diterima sebagai template. Email dikirim dengan HTML dan alternatif teks lengkap. Lampiran PDF dan header balasan tetap dipertahankan. Payload hasil render disimpan sebelum pengiriman agar retry memakai konten dan idempotency key yang sama.

Editor menyediakan **Pratinjau email** sebelum pengiriman. Pratinjau hanya memuat gambar dari `https://order.nalaro.digital`; gambar eksternal pada email masuk tetap diblokir. Banner tersedia pada `/brand/nalaro-email-banner.jpg` (53.464 byte, 1200 × 400). Email baru dan balasan memakai banner yang sama. Ganti aset tersebut dengan banner final jika diperlukan, kemudian deploy Pages.

Tombol **Email** pada invoice/receipt membuat draft khusus `billing@nalaro.digital`, termasuk lampiran PDF dan metadata billing. Pengirim billing harus tersedia dalam konfigurasi; aplikasi tidak memakai mailbox lain sebagai fallback. Draft dokumen lama yang belum memiliki metadata tetap memakai template billing umum; buat ulang melalui tombol Email untuk mendapatkan ringkasan dokumen.

Perubahan template memerlukan build/deploy Pages **dan** build/deploy Worker mailbox:

```sh
npm run build:mailbox
npm run test:email
npm run test:mailbox
npm run check
npm run build
```

Tidak ada email sungguhan dikirim oleh tes.

## Berkas implementasi

| Berkas | Fungsi |
| --- | --- |
| `src/components/react/Mailbox.tsx` | Inbox, Starred, Sent, Drafts, Trash, editor, reader, balasan, lampiran |
| `src/lib/mailbox.ts` | Klien API dan token Firebase |
| `src/styles/mailbox.css` | Tampilan mengikuti Project Desk dan tata letak mobile |
| `workers/mailbox/dashboard-worker.js` | Satu file ES module siap ditempel di dashboard Cloudflare |
| `workers/mailbox/src/worker.js` | Source handler HTTP, email, R2, dan pengiriman Resend |
| `workers/mailbox/src/auth.js` | Verifikasi signature RS256 dan claims token Firebase |
| `workers/mailbox/wrangler.jsonc` | Alternatif deployment melalui Wrangler |

`dashboard-worker.js` sudah menyertakan parser MIME PostalMime dan verifikasi JWT; tidak memerlukan import package npm saat ditempel ke dashboard. Bangun ulang file ini setelah mengubah source:

```sh
npm ci
npm run build:mailbox
```

## Konfigurasi Cloudflare yang sudah dibuat

Pada 7 Oktober 2026, layanan berikut telah dibuat melalui akun Cloudflare yang terhubung:

- Worker: `nalaro-mailbox`, origin `https://nalaro-mailbox.uniquefactuhl.workers.dev`.
- Bucket R2: `nalaro-mailbox`, lokasi APAC, binding `MAIL_BUCKET`.
- Variabel Worker: project Firebase `nalaro`, admin `admin@nalaro.digital`, nama pengirim `Nalaro`, lima alamat mailbox, dan dua origin frontend yang diizinkan.
- Email Routing domain `nalaro.digital` telah diaktifkan, dengan aturan hello/admin/billing/business/khoirululum menuju Worker.
- Pages project `nalaro-trans` telah mendapat `PUBLIC_MAILBOX_API_URL` untuk production dan preview. Variabel Firebase sebelumnya dipertahankan.
- Secret `RESEND_API_KEY` dikelola sendiri oleh pemilik melalui dashboard Worker; nilainya tidak disimpan dalam repository.

Konfigurasi frontend berlaku pada build Pages berikutnya. Halaman Mail Desk dirilis melalui branch production `main` pada repository `hulumzz/nalaro-trans` dengan Git integration Cloudflare Pages.

## 1. Siapkan domain pengirim di Resend

1. Tambahkan domain `nalaro.digital` dan verifikasi DNS sesuai dashboard Resend.
2. Buat API key dengan akses pengiriman untuk domain tersebut.
3. Simpan API key sebagai **secret Worker** bernama `RESEND_API_KEY`.
4. Gunakan alamat pengirim yang sudah masuk daftar `MAILBOX_ADDRESSES`, misalnya `hello@nalaro.digital` atau `billing@nalaro.digital`.

Penerimaan domain utama memakai **Cloudflare Email Routing**. Jangan mengaktifkan konfigurasi receiving Resend yang mengganti MX domain utama. Pertahankan MX Cloudflare pada `nalaro.digital`; record MX/SPF untuk return path pengiriman Resend biasanya menggunakan subdomain tersendiri sesuai petunjuk Resend. Pada satu hostname hanya boleh ada satu record SPF: periksa record yang ada sebelum menambah atau mengubahnya. Tambahkan DKIM dan kebijakan DMARC sesuai konfigurasi domain.

## 2. Buat R2 dan Worker melalui dashboard

1. Buat bucket R2, contoh nama `nalaro-mailbox`. Pertahankan akses privat; tidak perlu mengaktifkan `r2.dev`, custom public domain, atau CORS bucket.
2. Buat Worker terpisah, contoh `nalaro-mailbox`. Frontend Pages `nalaro-trans` tetap menggunakan konfigurasi Pages yang sudah ada.
3. Buka **Edit code**, ganti isi entry module dengan seluruh isi `workers/mailbox/dashboard-worker.js`, lalu deploy.
4. Di **Settings → Bindings**, tambahkan **R2 bucket binding**:
   - Variable name: `MAIL_BUCKET`
   - Bucket: bucket yang kamu buat.
5. Tambahkan variables/secrets di tabel berikut, lalu deploy ulang agar binding dan konfigurasi aktif.

| Nama | Jenis | Contoh / keterangan |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Variable | `nalaro`, harus sama dengan project Firebase frontend |
| `ADMIN_EMAIL` | Variable | `admin@nalaro.digital`, harus sama dengan email login admin |
| `ADMIN_UID` | Variable opsional | UID akun admin Firebase; disarankan untuk mengikat akses ke identitas admin yang sama |
| `MAILBOX_ADDRESSES` | Variable | `hello@nalaro.digital,admin@nalaro.digital,billing@nalaro.digital,business@nalaro.digital,khoirululum@nalaro.digital` |
| `MAIL_FROM_NAME` | Variable opsional | `Nalaro` |
| `ALLOWED_ORIGINS` | Variable | `https://order.nalaro.digital`; beberapa origin dipisahkan koma, tanpa slash terakhir |
| `RESEND_API_KEY` | **Secret** | API key pengiriman Resend |

Tidak perlu memasukkan account key atau access key R2. Worker memakai binding `MAIL_BUCKET` langsung. Jangan menaruh secret Resend atau R2 dalam variable `PUBLIC_*`, source code, atau Git.

Catat origin Worker, misalnya `https://nalaro-mailbox.NAMA-AKUN.workers.dev`. Custom domain seperti `mail-api.nalaro.digital` juga bisa digunakan setelah kamu mengaturnya di Cloudflare.

## 3. Hubungkan Cloudflare Email Routing

1. Aktifkan Email Routing untuk `nalaro.digital`, dan terapkan record DNS yang diminta Cloudflare.
2. Buat custom address untuk setiap alamat yang dipakai, yaitu `hello`, `admin`, `billing`, `business`, dan `khoirululum`.
3. Atur action setiap custom address menjadi **Send to a Worker**, lalu pilih Worker mailbox tadi.
4. Daftar alamat pada Email Routing harus cocok dengan `MAILBOX_ADDRESSES`. Alamat di luar daftar ditolak oleh Worker.
5. Catch-all bersifat opsional; untuk tahap awal gunakan alamat eksplisit agar mudah dikelola.

Email diterima oleh handler native Cloudflare `email()`. Tidak ada webhook HTTP publik untuk memasukkan email dan tidak ada pengalihan ke Gmail. Cloudflare dapat meminta verifikasi destination address saat onboarding Email Routing; langkah onboarding akun tersebut berbeda dari penyimpanan mailbox melalui Worker.

## 4. Hubungkan frontend NalaroTrans

Pada environment variable build Cloudflare Pages, tambahkan:

```dotenv
PUBLIC_MAILBOX_API_URL="https://nalaro-mailbox.NAMA-AKUN.workers.dev"
```

Gunakan origin saja; frontend menambahkan `/api/mail/...`. Rebuild/redeploy Pages setelah mengisi atau mengubah variable ini. Jika preview Pages juga perlu akses, masukkan origin preview persis ke `ALLOWED_ORIGINS`; tidak ada wildcard otomatis.

Untuk lokal:

```dotenv
PUBLIC_MAILBOX_API_URL="http://127.0.0.1:8787"
```

Tambahkan `http://localhost:4321` atau origin dev yang sebenarnya ke `ALLOWED_ORIGINS` pada Worker lokal. Pastikan domain frontend produksi sudah berada dalam authorized domains Firebase Authentication sesuai konfigurasi login proyek.

Jika variable frontend belum diisi, menu Email tetap tersedia dan menampilkan kondisi **Mailbox belum terhubung**. Tidak ada email contoh atau status berhasil palsu pada halaman produksi. Jika secret Resend belum diisi, menerima email, membaca mailbox, dan menyimpan draft tetap tersedia; tombol kirim dinonaktifkan.

## 5. Invoice dan receipt melalui email

Daftar invoice dan receipt memiliki tombol **Email**:

1. PDF dibuat memakai template transaksi yang sudah ada.
2. Alamat email klien diisi dari data klien atau snapshot transaksi jika tersedia.
3. Sistem membuat draft berlampiran PDF, memakai `billing@` bila ada, lalu membuka editor Mail Desk.
4. Admin memeriksa penerima dan isi sebelum menekan **Kirim email**.

Ini menyediakan pengiriman dari dalam sistem. Penerbitan invoice/receipt belum otomatis mengirim email tanpa tindakan admin. Otomatisasi event transaksi dapat menggunakan lapisan pengiriman server yang sama dalam pengembangan berikutnya.

## 6. Perilaku mailbox

- Kotak surat dipilih melalui dropdown. Setiap alamat mempunyai prefix penyimpanan tersendiri di R2, dan seluruh alamat diakses oleh admin yang sama.
- Inbox: email masuk, ditandai belum dibaca. Saat dibuka ditandai dibaca.
- Sent: email yang sudah diterima Resend atau masih perlu rekonsiliasi pengiriman.
- Drafts: pesan yang disimpan dan kegagalan pengiriman yang pasti ditolak provider.
- Starred: pesan berbintang dari folder selain Trash.
- Trash: pesan yang dipindah dari folder asal. Bisa dipulihkan; hapus permanen membutuhkan konfirmasi dan hanya berlaku pada pesan yang sudah berada di Trash.
- Pencarian mencakup subjek, alamat pengirim, dua penerima pertama, dan cuplikan teks pada metadata list. Hasil dimuat bertahap per 100 objek R2; **Muat lebih banyak** tetap tersedia jika bagian saat ini belum menghasilkan kecocokan. Ini bukan pencarian isi penuh seluruh arsip.
- Ringkasan list memotong teks panjang untuk menjaga batas metadata R2. Reader menampilkan isi pesan yang tersimpan.
- Lampiran keluar: maksimal 10 file, total 8 MB. Batas JSON API 12 MB termasuk base64.
- Email masuk: maksimal 10 MB untuk pesan MIME utuh. Reader menyimpan teks maksimal 200.000 karakter, HTML maksimal 1.000.000 karakter, dan mengekstrak maksimal 50 lampiran. File `.eml` asli selalu menyimpan isi lengkap yang diterima.
- Balasan memakai `Reply-To` jika tersedia, serta `In-Reply-To`/`References` agar client email penerima dapat menghubungkan thread.
- HTML disanitasi dan ditampilkan pada iframe sandbox dengan CSP. Gambar eksternal dan tracker diblokir; script dan form tidak diizinkan. Pengiriman editor berupa plain text; HTML diterima tetap bisa dibaca.
- Status **Diterima Resend** berarti provider menerima permintaan, bukan bukti email sampai di inbox penerima. Dashboard Resend digunakan untuk delivery/bounce; webhook status delivery belum disertakan.
- Tidak ada IMAP/POP/SMTP mailbox endpoint atau sinkronisasi Gmail. Mail Desk ini adalah webmail internal melalui API.

## 7. Ketahanan pengiriman dan penyimpanan

Sebelum memanggil Resend, Worker menyimpan payload pengiriman yang tetap dan mengambil kunci pengiriman melalui conditional write ETag R2. Retry memakai `Idempotency-Key` dan payload yang sama. Jika respons jaringan tidak jelas atau provider mengembalikan status ambigu, pesan masuk Sent dengan status **Perlu diperiksa**, bukan langsung dianggap gagal atau berhasil.

Gunakan tombol **Periksa / coba ulang** pada pesan tersebut. Pengiriman berstatus `sending` memerlukan jeda dua menit sebelum retry; retry diblokir setelah 23 jam sejak percobaan awal untuk tetap berada dalam jendela idempotensi Resend. Setelah batas ini habis, periksa dashboard Resend sebelum membuat email baru. Pesan ambigu dikunci dari edit, pemindahan folder, dan hapus sampai statusnya selesai.

Pesan masuk dideduplikasi dengan hash SHA-256 isi MIME. R2 menyimpan marker kecil penerimaan agar pengantaran ulang identik tidak menduplikasi atau menghidupkan kembali pesan yang sudah dihapus. Marker ini dipertahankan setelah hapus permanen; isi email dan lampiran tetap dihapus.

Verifikasi API memeriksa signature token Firebase, issuer, audience/project, waktu kedaluwarsa, dan identitas admin. Verifikasi JWT lokal tidak memeriksa revocation/disabled-account secara langsung setiap request; token yang sudah terbit dapat berlaku sampai kedaluwarsa. `ADMIN_UID` menyediakan pembatasan tambahan ke UID admin.

R2 list dan storage tidak memerlukan D1/KV/Durable Objects. Untuk arsip besar yang membutuhkan pencarian seluruh isi dan indeks/count folder, tambahkan indeks database pada pengembangan berikutnya. Pemakaian tetap mengikuti kuota paket Resend/Cloudflare dan penyimpanan aktual; kode tidak menjamin seluruh volume penggunaan selalu gratis.

## 8. Alternatif deployment CLI

Edit `workers/mailbox/wrangler.jsonc` agar bucket, origin, alamat, dan project sesuai konfigurasi kamu:

```sh
npx wrangler secret put RESEND_API_KEY --config workers/mailbox/wrangler.jsonc
npx wrangler deploy --config workers/mailbox/wrangler.jsonc
```

Deployment dashboard memakai bundle yang sudah disediakan; CLI dapat membundel source langsung. Keduanya melayani API dan email dengan handler yang sama.

## 9. API internal

Semua endpoint HTTP selain preflight membutuhkan `Authorization: Bearer FIREBASE_ID_TOKEN`. Parameter `mailbox` harus termasuk daftar alamat yang diizinkan.

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/api/mail/config` | Alamat dan status konfigurasi pengiriman |
| GET | `/api/mail/messages?mailbox=...&folder=inbox&q=...&cursor=...` | List/pencarian bertahap |
| POST | `/api/mail/drafts?mailbox=...` | Buat draft |
| GET | `/api/mail/messages/:id?mailbox=...` | Baca pesan |
| PUT | `/api/mail/messages/:id?mailbox=...` | Simpan ulang draft termasuk lampiran |
| POST | `/api/mail/messages/:id/send?mailbox=...` | Kirim draft atau retry pengiriman yang sama |
| PATCH | `/api/mail/messages/:id?mailbox=...` | Ubah read, starred, Trash/pulihkan |
| DELETE | `/api/mail/messages/:id?mailbox=...` | Hapus permanen dari Trash |
| GET | `/api/mail/messages/:id/attachments/:attachmentId?mailbox=...` | Unduh lampiran privat |
| GET | `/api/mail/messages/:id/raw?mailbox=...` | Unduh MIME `.eml` asli |

Format draft:

```json
{
  "to": ["client@example.com"],
  "subject": "Nalaro invoice",
  "text": "Hello, please find your invoice attached.",
  "attachments": [{ "filename": "invoice.pdf", "contentType": "application/pdf", "content": "BASE64_FILE" }]
}
```

## 10. Pengujian

```sh
npm run check
npm run build:mailbox
npm run test:mailbox
npx playwright install chromium
npm run test:mailbox-ui
npm run test:pdf
npm run build
```

Tes Worker memakai bundle dashboard yang benar-benar akan dideploy, mock Resend, token RSA bertanda tangan, dan bucket R2 in-memory. Tes UI memakai service fixture terpisah dan tidak menulis mailbox produksi. Meliputi autentikasi, isolasi mailbox, penerimaan MIME, lampiran, idempotensi, concurrent send, provider error, Trash/pulihkan, serta layout mobile dan blokir tracker HTML.

Setelah kamu memasang konfigurasi nyata, lakukan smoke test sendiri: kirim email dari alamat eksternal ke `hello@nalaro.digital`, baca dan unduh lampirannya, balas dari Mail Desk, lalu periksa log/delivery Resend dan penerimaan balasan di email eksternal.

## Referensi resmi

- Cloudflare email handler: https://developers.cloudflare.com/email-service/api/route-emails/email-handler/
- R2 Workers API dan conditional writes: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Firebase ID token verification: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Resend send API: https://resend.com/docs/api-reference/emails/send-email
- Resend idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend threaded reply headers: https://resend.com/docs/dashboard/receiving/reply-to-emails
