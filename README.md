# NalaroTrans

Project Desk untuk proyek, klien, invoice, pembayaran, receipt, dan verifikasi publik Nalaro. Dibangun dengan Astro, React, dan Firebase. Halaman admin memakai desain Project Desk; halaman verifikasi memakai header/footer Nalaro.

## Pengembangan dan build

Gunakan Node.js >=22.12.0.

```sh
npm ci
npm run dev
npm run check
npm run build
```

Cloudflare Pages: build command `npm run build`, output directory `dist` (juga ditetapkan pada `wrangler.jsonc`). Aturan `public/_redirects` melayani `/admin/*`, `/verifi/*`, `/verif/*`, dan `/form/*` melalui URL direktori tujuan yang berbeda dari pola sumber. Target tidak memakai `/index.html` agar diterima parser routing Cloudflare Pages. Halaman root juga mengenali URL publik dan URL admin jika hosting memakai fallback SPA; akses admin tetap dilindungi login.

## Form order dan akun admin

Bagikan `https://order.nalaro.digital/form/order` kepada klien. Tautan **Form order klien** tersedia di sidebar admin. Form mengikuti tema utama Nalaro dan dapat diisi tanpa login: nama klien/usaha, penanggung jawab, email, WhatsApp, alamat opsional, nama proyek, jenis layanan, dan target selesai opsional. Harga, deskripsi, serta status pekerjaan diatur admin melalui **Clients** dan **Projects** yang tetap menyediakan edit.

Pengiriman membuat satu client dan satu project dalam batch atomik, dengan ID relasi yang sama, sumber `public_order`, status project `planning`, dan nilai awal nol. Rules memvalidasi field, ukuran, hubungan kedua dokumen, dan server timestamp. Publik hanya boleh membuat pasangan baru; membaca/listing, mengedit, menghapus, mengisi harga/deskripsi, dan menulis invoice/payment/receipt tetap dilarang. Honeypot pada form membantu mengurangi bot sederhana, tetapi bukan pembatasan laju di server.

Email admin adalah `admin@nalaro.digital`, digunakan bersama oleh UI login, penjaga halaman admin, dan rules Firestore. Mengubah string di kode saja tidak mengubah akun Firebase Authentication. Saat migrasi akun yang sudah ada, ubah email pada UID admin lama agar password dan identitas akun tetap terjaga. Login ulang setelah perubahan email.

Rules Firestore dirilis terpisah dari Cloudflare Pages:

```sh
firebase deploy --only firestore:rules --project nalaro
```

Backup rules aktif sebelum menerapkan perubahan. Deployment Pages melalui push Git tidak otomatis menerapkan `firestore.rules`.

## Pembayaran dan dokumen PDF

1. Buka **Pengaturan**, isi rekening bank dan/atau informasi e-wallet.
2. Unggah gambar **QRIS statis** asli dalam PNG/JPG (maksimal 300 KB, minimal 128 × 128 piksel). Sistem memakai gambar ini apa adanya; tidak membuat atau mengubah kode pembayaran.
3. Pilih metode saat membuat invoice: Bank Transfer, QRIS, Cash, E-Wallet, atau Other. Metode pembayaran aktual dipilih ketika mencatat pembayaran.
4. Unduh PDF dari daftar invoice/receipt. Tombol menampilkan status pembuatan dan pesan ketika unduhan gagal.

Informasi pembayaran pada dokumen baru disimpan ketika invoice diterbitkan atau pembayaran dicatat. Receipt memakai informasi pembayaran yang tercatat pada pembayaran tersebut. Perubahan rekening di Pengaturan tidak mengubah informasi pada dokumen yang sudah memiliki salinan tersebut. Dokumen lama tanpa salinan memakai pengaturan saat diunduh. Cash tidak menampilkan informasi rekening, e-wallet, atau QRIS.

PDF memakai layout A4 satu halaman: header abu-abu terang, aksen oranye, watermark logo tanpa alpha mask, blok summary/total, detail pembayaran, dan QR verifikasi. Invoice memakai bahasa visual yang sama. QR berukuran 36 mm memakai error correction H, quiet zone empat modul, dan logo tengah yang lebih kecil untuk menjaga scan. Label `Scan to verify the transaction` berada tepat di tengah di atas QR. Isi panjang dipadatkan agar QR tetap utuh di atas footer; item yang tidak muat disebutkan jumlahnya, dan isi lengkap tetap tersimpan pada data transaksi. Footer menautkan `https://www.nalaro.one`. PDF yang sudah diunduh perlu diunduh ulang untuk memakai layout terbaru.

## URL verifikasi

Kolom **URL dasar verifikasi** di Pengaturan dapat dikosongkan untuk mengikuti alamat aplikasi yang sedang diakses, termasuk domain Pages yang aktif. Contoh URL khusus: `https://alamat-aplikasi/verifi/`.

Urutan pemilihan alamat: pengaturan eksplisit, `PUBLIC_VERIFICATION_BASE_URL`, lalu origin aplikasi. Nilai bawaan lama `https://e-invoice.nalaro.digital/verifi/` otomatis mengikuti origin saat aplikasi diakses dari host lain. Halaman verifikasi juga menerima `/verifi/?token=TOKEN` untuk host tanpa rewrite path.

Subdomain khusus harus ditambahkan dan diaktifkan melalui penyedia hosting/DNS sebelum dipakai. Perubahan kode tidak membuat DNS subdomain aktif. PDF yang sudah tersimpan dengan alamat lama perlu diunduh ulang; token verifikasi tetap sama.

## Pengujian regresi PDF

```sh
npx playwright install chromium
npm run test:pdf
```

Pengujian membangun modul PDF untuk produksi, membuka Chromium, menguji unduhan PDF sesungguhnya, empat metode pembayaran, teks panjang, kestabilan salinan informasi pembayaran, migrasi URL lama, parsing token, serta scan QR berlogo pada ukuran 600/300/160 piksel. Keluaran contoh ada di `artifacts/pdf-tests/` (diabaikan Git). Gambar QRIS pada pengujian merupakan kode demo, bukan QRIS pembayaran asli.

`CHROMIUM_EXECUTABLE` dan `CHROMIUM_ARGS` (array JSON) dapat dipakai jika browser disediakan oleh lingkungan pengujian.

## Pengujian form, akses, dan routing

```sh
npm run test:rules
node tests/preview.mjs
npm run test:ui
```

`test:rules` mengompilasi dan menguji 78 kasus melalui Firebase Rules test API tanpa menulis data produksi. Dibutuhkan Firebase CLI yang sudah login; `FIREBASE_TOOLS_ROOT` dapat menunjuk direktori package `firebase-tools` jika CLI terpasang di luar repo. `test:ui` memeriksa build statis, deep link publik, akses admin, form pada 320/390/1440 piksel, dan kondisi offline. Atur `TEST_BASE_URL` untuk menguji deployment Pages sesungguhnya.

Pengujian batch dan submit browser terhadap emulator tersedia melalui `npm run test:orders`; jalankan Firestore Emulator terlebih dahulu pada port 8085, project `demo-nalaro-orders` (Java 21).

## CRUD data

Menu **Clients** dan **Projects** menyediakan View, Edit, dan Delete. Penghapusan client/project diblokir bila masih memiliki relasi penting. Invoice dapat dihapus beserta payment/receipt/public registry terkait, sedangkan menghapus receipt tidak menghapus payment sehingga receipt dapat diterbitkan kembali.

## Mail Desk — email custom Nalaro

Menu **Email** membuka `/admin/email` dengan login admin yang sama. Mendukung Inbox, Starred, Sent, Drafts, Trash, balasan, beberapa alamat mailbox, lampiran, dan HTML reader terisolasi. Email masuk melalui Cloudflare Email Routing Worker, tersimpan di R2 privat; pengiriman melalui Resend. Gmail tidak diperlukan dalam alur mailbox.

Tombol **Email** pada invoice/receipt membuat draft beserta PDF untuk diperiksa sebelum dikirim. Halaman menampilkan kondisi belum terhubung selama layanan belum dikonfigurasi.

Script **siap ditempel ke dashboard Cloudflare**: [`workers/mailbox/dashboard-worker.js`](workers/mailbox/dashboard-worker.js). Binding R2: `MAIL_BUCKET`. API key Resend hanya di secret Worker `RESEND_API_KEY`. Frontend memakai `PUBLIC_MAILBOX_API_URL` berisi origin Worker, lalu perlu rebuild Pages. Konfigurasi Worker dan DNS belum dideploy otomatis.

Panduan lengkap dashboard, daftar variables, DNS, pengujian, dan batas implementasi: [`docs/custom-mailbox.md`](docs/custom-mailbox.md).

```sh
npm run build:mailbox
npm run test:mailbox
npm run test:mailbox-ui
```
