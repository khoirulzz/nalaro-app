# PRD — Nalaro E-Invoice & Project Desk

## 1. Ringkasan Produk

**Nama produk:** Nalaro E-Invoice  
**Subdomain target:** `e-invoice.nalaro.digital`  
**Tipe aplikasi:** Web app statis dengan backend ringan berbasis Firebase  
**Target pengguna utama:** Internal Nalaro / admin  
**Target pengguna publik:** Client atau pihak penerima invoice/receipt yang melakukan verifikasi QR

Nalaro E-Invoice adalah sistem internal sederhana untuk mencatat project, client, invoice, pembayaran, receipt, dan arsip dokumen Nalaro.

Sistem ini dirancang bukan sebagai software akuntansi penuh, melainkan sebagai **project administration desk** yang membantu Nalaro mengelola pekerjaan dari awal project masuk sampai pembayaran selesai.

Aplikasi juga menyediakan halaman verifikasi publik melalui QR Code pada invoice dan payment receipt.

## 2. Tujuan Produk

1. Menyimpan data project Nalaro secara terstruktur.
2. Menyimpan data client agar tidak perlu diinput ulang.
3. Membuat invoice digital secara cepat.
4. Mencatat pembayaran secara manual.
5. Membuat payment receipt setelah pembayaran dikonfirmasi.
6. Menyediakan QR verification untuk invoice dan receipt.
7. Menyimpan arsip project dan dokumen secara rapi.
8. Menjadi sistem administrasi internal Nalaro yang ringan dan mudah digunakan.
9. Tetap mempertahankan identitas visual dan pengalaman pengguna yang konsisten dengan website utama Nalaro.

## 3. Prinsip Produk

Sistem harus:
- sederhana;
- cepat;
- ringan;
- tidak memiliki fitur akuntansi yang tidak diperlukan;
- mudah di-maintain;
- tidak membutuhkan server tradisional;
- mobile friendly;
- aman untuk data internal;
- tetap fleksibel jika Nalaro berkembang;
- dapat menghasilkan PDF dari sisi browser;
- memiliki halaman verifikasi dokumen yang dapat diakses publik.

## 4. Arsitektur

### 4.1 Frontend
Frontend menggunakan pendekatan static web app.

Deployment:
`Cloudflare Pages`

Domain:
`e-invoice.nalaro.digital`

Frontend menggunakan stack yang konsisten dengan aplikasi utama Nalaro. Jika aplikasi utama menggunakan Astro, e-invoice dapat menggunakan Astro dengan JavaScript/TypeScript.

### 4.2 Authentication
Admin menggunakan Firebase Authentication.

Metode:
`Email / Password`

Akun admin awal:
`admin@nalaro.digital`

Password dikelola melalui Firebase Authentication dan **tidak disimpan langsung di source code frontend**.

Untuk versi awal hanya dibutuhkan satu akun admin.

### 4.3 Database
Database menggunakan:
`Cloud Firestore`

Collection utama:
- `clients`
- `projects`
- `invoices`
- `payments`
- `receipts`

Collection tambahan:
- `settings`
- `public_documents`
- `activity_logs` (opsional)

### 4.4 PDF
PDF dibuat sepenuhnya di sisi client/browser.

Tidak diperlukan server-side PDF renderer.

Library dapat menggunakan:
- jsPDF
- jspdf-autotable
- QR code generator

PDF harus:
- ukuran A4;
- mudah dicetak;
- memiliki layout profesional;
- memuat QR verification;
- tetap ringan;
- tidak perlu disimpan permanen di Firebase Storage.

Data utama tetap disimpan dalam Firestore dan PDF dapat dibuat ulang kapan saja dari data terbaru.

## 5. Role Pengguna

### 5.1 Admin
Admin memiliki akses penuh ke:
- dashboard;
- client;
- project;
- invoice;
- payment;
- receipt;
- archive;
- settings;
- generate PDF.

### 5.2 Public Visitor
Public visitor hanya dapat:
- membuka halaman verification;
- memasukkan atau membuka verification token;
- melihat informasi terbatas mengenai dokumen.

Public visitor tidak dapat:
- melihat dashboard;
- melihat daftar client;
- melihat daftar project;
- mengubah data;
- melihat informasi sensitif.

## 6. Login

Route:
`/login`

Fitur:
- input email;
- input password;
- login menggunakan Firebase Auth;
- logout;
- session persistence.

Jika user belum login dan membuka route admin, redirect ke `/login`.

## 7. Dashboard

Route:
`/admin`

Dashboard menampilkan:
- Active Projects
- Waiting Payment
- Paid This Month
- Overdue Invoice
- Completed Projects
- Total Project Value (opsional)

### Recent Projects
Data:
- Project Number
- Client
- Project Name
- Service Type
- Deadline
- Status

### Recent Invoice
Menampilkan invoice terbaru beserta status.

## 8. Client Management

Route:
`/admin/clients`

### 8.1 Data Client
Field:
- `id`
- `clientCode`
- `name`
- `picName`
- `email`
- `whatsapp`
- `address`
- `notes`
- `createdAt`
- `updatedAt`

Contoh kode:
`CLI-0001`

### 8.2 Client Detail
Route:
`/admin/clients/:id`

Menampilkan:
- informasi client;
- daftar project;
- total project;
- invoice terkait;
- receipt terkait.

## 9. Project Management

Route:
`/admin/projects`

Project merupakan record utama pekerjaan Nalaro.

### 9.1 Project Number
Format:
`NAL/PRJ/YYYY/XXXX`

Contoh:
`NAL/PRJ/2026/0001`

Nomor dibuat otomatis.

### 9.2 Field Project
- Project Number
- Project Name
- Client ID
- Service Type
- Received Date
- Deadline
- Project Status
- Project Value
- Description
- Internal Notes
- Created At
- Updated At

### 9.3 Service Type
Default:
- Website Development
- Landing Page
- Custom Information System
- Maintenance
- Hosting
- Domain
- Nalaro Product
- Other

### 9.4 Project Status
- Planning
- In Progress
- Review
- Completed
- Cancelled
- On Hold (opsional)

### 9.5 Project Detail
Route:
`/admin/projects/:id`

Menampilkan:
- Project Number
- Project Name
- Client
- Service Type
- Received Date
- Deadline
- Status
- Project Value
- Related Invoice
- Payment Status
- Receipt
- Notes

## 10. Invoice Management

Route:
`/admin/invoices`

Invoice dapat dibuat dari halaman project melalui tombol:
`Create Invoice`

### 10.1 Invoice Number
Format:
`NAL/INV/YYYY/XXXX`

Contoh:
`NAL/INV/2026/0001`

Nomor dibuat otomatis.

### 10.2 Invoice Field
- Invoice ID
- Invoice Number
- Project ID
- Client ID
- Issue Date
- Due Date
- Status
- Items
- Subtotal
- Discount
- Tax Status
- Tax Amount
- Grand Total
- Paid Amount
- Outstanding Amount
- Notes
- Public Token
- Created At
- Updated At

### 10.3 Invoice Item
Field item:
- description
- details
- quantity
- unitPrice
- total

Contoh:
Website Development  
Design & development website company profile  
1 × Rp4.000.000

## 11. Tax Handling

Karena Nalaro masih berskala kecil dan belum menjadi PKP, default sistem:
`PPN: Tidak dipungut`

Invoice tidak menggunakan:
`PPN 0%`

Sistem tetap fleksibel agar pengaturan pajak dapat ditambahkan di masa depan.

Field:
- `taxType`
- `taxRate`
- `taxAmount`

Default:
- taxType: `none`
- taxAmount: `0`

Teks PDF:
`PPN tidak dipungut.`

Tambahkan catatan:
`Dokumen ini merupakan invoice/tagihan komersial dan bukan Faktur Pajak.`

## 12. Invoice Status

Status:
- Draft
- Unpaid
- Partial
- Paid
- Overdue
- Cancelled

**Overdue** dapat dihitung otomatis jika current date > due date dan invoice belum Paid/Cancelled.

## 13. Payment Management

Pembayaran dikonfirmasi secara manual oleh admin.

Tidak ada payment gateway pada V1.

Button:
`Record Payment`

### 13.1 Payment Field
- Payment ID
- Invoice ID
- Payment Date
- Amount
- Payment Method
- Reference
- Notes
- Created At

### 13.2 Payment Method
- Bank Transfer
- Cash
- E-Wallet
- Other

### 13.3 Partial Payment
Sistem harus mendukung pembayaran sebagian.

Contoh:

Invoice:
Rp5.000.000

Pembayaran pertama:
Rp2.500.000

Status:
`PARTIAL`

Outstanding:
Rp2.500.000

Setelah pembayaran kedua:
Rp2.500.000

Status:
`PAID`

Outstanding:
Rp0

## 14. Payment Receipt

Receipt hanya dapat dibuat jika sudah ada payment.

Receipt tidak harus otomatis diterbitkan.

Admin memilih:
`Generate Receipt`

### 14.1 Receipt Number
Format:
`NAL/RCPT/YYYY/XXXX`

Contoh:
`NAL/RCPT/2026/0001`

### 14.2 Receipt Field
- Receipt ID
- Receipt Number
- Invoice ID
- Payment ID
- Client ID
- Amount
- Payment Date
- Payment Method
- Public Token
- Notes
- Created At

## 15. Verification

Public route:
`/verif/:token`

Contoh:
`https://e-invoice.nalaro.digital/verif/x7Qm9K2pV4Lc8Nw3`

QR pada PDF mengarah ke URL tersebut.

### 15.1 Public Token
Token harus:
- random;
- sulit ditebak;
- unik;
- minimal 16 karakter.

Contoh:
`x7Qm9K2pV4Lc8Nw3`

### 15.2 Invoice Verification
Informasi publik:
- Document Status
- Document Type
- Invoice Number
- Client Name
- Project Name
- Issue Date
- Due Date
- Amount
- Payment Status

### 15.3 Receipt Verification
Informasi:
- Document Status
- Document Type
- Receipt Number
- Related Invoice
- Client
- Amount Received
- Payment Date
- Payment Method
- Status

### 15.4 Data yang Tidak Ditampilkan
Halaman verification tidak boleh menampilkan:
- nomor rekening;
- nomor WhatsApp;
- email;
- alamat lengkap;
- catatan internal;
- data sensitif lain.

## 16. PDF Invoice

PDF invoice minimal berisi:

### Header
- Logo Nalaro
- Invoice
- Invoice Number
- Issue Date
- Due Date
- Status

### Issued By
- Nalaro
- Nama penanggung jawab
- Kota/lokasi
- Email opsional
- Website

### Billed To
- Client Name
- PIC
- Address opsional

### Project
- Project Name
- Project Number
- Service Type

### Items
- Item
- Description
- Qty
- Price
- Total

### Summary
- Subtotal
- Discount
- Tax
- Grand Total

Default:
`PPN tidak dipungut`

### Payment Information
- Bank
- Account Holder
- Account Number
- Payment Reference

### QR Verification
Text:
`Verify this document`

QR:
`https://e-invoice.nalaro.digital/verif/:token`

### Notes
Default:
`Dokumen ini merupakan invoice/tagihan komersial dan bukan Faktur Pajak.`

`Scope pekerjaan mengikuti proposal atau kesepakatan proyek yang telah disetujui.`

## 17. PDF Receipt

Receipt dibuat lebih sederhana.

Berisi:
- Logo Nalaro
- Payment Receipt
- Receipt Number
- Related Invoice
- Client
- Project
- Payment Date
- Amount Received
- Payment Method
- Payment Reference
- Status
- QR Verification

Text:
`Payment verified`

`This receipt confirms payment recorded by Nalaro.`

## 18. Issued Digitally

Tidak diperlukan tanda tangan scan sebagai requirement sistem.

Bagian bawah dokumen:
`ISSUED DIGITALLY BY`

Nama:
`Muhamad Khoirul Ulum`

Brand:
`Nalaro`

Tanggal:
tanggal dokumen

QR verification digunakan sebagai mekanisme pengecekan keaslian dokumen dalam sistem Nalaro.

## 19. Archive

Route:
`/admin/archive`

Archive merupakan view/filter, bukan collection baru.

Filter:
- Year
- Client
- Service Type
- Project Status
- Invoice Status
- Payment Status

Archive menampilkan:
- Projects
- Invoices
- Receipts

## 20. Search

Admin dapat mencari berdasarkan:
- Client Name
- Project Name
- Project Number
- Invoice Number
- Receipt Number

## 21. Filter

Project:
- status
- service type
- client
- year

Invoice:
- status
- client
- year

Receipt:
- client
- year

## 22. Settings

Route:
`/admin/settings`

### Nalaro Identity
- Business Name
- Owner Name
- Address
- Email
- Website
- WhatsApp

### Payment Account
- Bank Name
- Account Number
- Account Holder

### Document Prefix
Default:
`NAL`

### Verification Base URL
Default:
`https://e-invoice.nalaro.digital/verif/`

### Invoice Notes
Default notes.

## 23. Firestore Structure

- `clients/{clientId}`
- `projects/{projectId}`
- `invoices/{invoiceId}`
- `payments/{paymentId}`
- `receipts/{receiptId}`
- `settings/general`
- `public_documents/{token}`

## 24. Relationship

```text
CLIENT
  |
  +-- PROJECT
        |
        +-- INVOICE
              |
              +-- PAYMENT
                    |
                    +-- RECEIPT
```

Satu client dapat memiliki banyak project.  
Satu project dapat memiliki banyak invoice.  
Satu invoice dapat memiliki satu atau banyak payment.  
Satu payment dapat memiliki receipt.

## 25. Firestore Security

Admin data hanya dapat dibaca dan ditulis oleh authenticated admin.

Public verification hanya boleh membaca data yang secara eksplisit disiapkan untuk verification.

Disarankan membuat data verification yang sudah disanitasi dalam:
`public_documents/{token}`

Dengan cara ini halaman public tidak perlu membaca collection invoice langsung.

## 26. Public Document Collection

Contoh invoice:

```json
{
  "type": "invoice",
  "documentNumber": "NAL/INV/2026/0001",
  "clientName": "PT Contoh Indonesia",
  "projectName": "Company Profile Website",
  "issueDate": "2026-10-06",
  "dueDate": "2026-10-13",
  "amount": 5000000,
  "status": "paid",
  "valid": true
}
```

Contoh receipt:

```json
{
  "type": "receipt",
  "documentNumber": "NAL/RCPT/2026/0001",
  "relatedInvoice": "NAL/INV/2026/0001",
  "clientName": "PT Contoh Indonesia",
  "amount": 5000000,
  "paymentDate": "2026-10-06",
  "status": "paid",
  "valid": true
}
```

## 27. Design Direction

Desain e-invoice mengikuti design system utama Nalaro.

Tidak dibuat sebagai aplikasi SaaS generik.

Harus mempertahankan:
- warna utama Nalaro;
- typography;
- grid;
- spacing;
- line/border style;
- button style;
- label;
- badge;
- motion;
- iconography;
- layout philosophy.

Admin UI tetap dapat lebih compact karena sifatnya sebagai productivity tool.

Verification page juga harus tetap terasa sebagai bagian dari Nalaro.

PDF disarankan:
- background putih;
- typography hitam;
- accent orange;
- layout minimal;
- tetap membawa branding Nalaro.

## 28. Responsive Design

Admin harus dapat digunakan pada:
- desktop;
- tablet;
- smartphone.

Prioritas:
desktop.

Mobile tetap mendukung:
- melihat project;
- membuat/update data ringan;
- mengecek invoice;
- record payment;
- generate/share PDF.

## 29. MVP Scope

Versi pertama hanya harus memiliki:

1. Login
2. Dashboard
3. Client Management
4. Project Management
5. Invoice Management
6. Record Payment
7. Partial Payment
8. Payment Receipt
9. PDF Invoice
10. PDF Receipt
11. QR Verification
12. Public Verification Page
13. Archive
14. Search
15. Basic Settings

## 30. Non-MVP

Tidak perlu pada V1:
- payment gateway;
- automatic bank verification;
- WhatsApp API;
- automatic email delivery;
- accounting ledger;
- expense tracking;
- payroll;
- inventory;
- quotation system;
- tax reporting;
- e-Faktur;
- multi-user permission;
- audit approval workflow;
- Firebase Storage PDF archive;
- online signature provider;
- notification system.

## 31. User Flow

### New Project
```text
Login
  ↓
New Client / Select Client
  ↓
Create Project
  ↓
Project Active
```

### Invoice
```text
Project
  ↓
Create Invoice
  ↓
Add Items
  ↓
Generate Invoice
  ↓
Download PDF
  ↓
Send to Client
```

### Payment
```text
Invoice
  ↓
Record Payment
  ↓
Partial / Paid
```

### Receipt
```text
Payment Confirmed
  ↓
Generate Receipt
  ↓
Download PDF
  ↓
Send to Client
```

### Verification
```text
Client scans QR
  ↓
e-invoice.nalaro.digital/verif/:token
  ↓
Firestore public document
  ↓
Verified document information
```

## 32. Status Automation

Overdue dihitung otomatis jika:
- current date > dueDate;
- status bukan Paid;
- status bukan Cancelled.

Tidak harus disimpan permanen.

## 33. Data Integrity

Data uang disimpan sebagai integer Rupiah.

Contoh:
`5000000`

Bukan:
`"Rp5.000.000"`

Formatting hanya dilakukan di UI.

Date menggunakan Firestore Timestamp atau format ISO yang konsisten.

## 34. Document Immutability

Setelah invoice diterbitkan, invoice harus menyimpan snapshot:
- client name;
- client address;
- project name;
- invoice items;
- totals.

Tujuannya agar perubahan profil client di kemudian hari tidak mengubah invoice lama.

## 35. Cancellation

Invoice dan receipt yang sudah diterbitkan tidak dihapus permanen.

Gunakan:
`CANCELLED`
atau
`VOID`

Halaman verification tetap dapat menampilkan:
`DOCUMENT CANCELLED`

## 36. Backup

Firestore menjadi source of truth.

Untuk awal tidak diperlukan backup automation kompleks, tetapi export berkala disarankan jika volume data mulai meningkat.

## 37. Target Penggunaan

Sistem ditujukan untuk:
- administrasi project kecil-menengah;
- pencatatan client;
- penerbitan invoice;
- pencatatan pembayaran;
- receipt;
- verifikasi dokumen.

Sistem bukan pengganti software akuntansi atau sistem perpajakan.

## 38. Acceptance Criteria MVP

MVP dianggap selesai ketika admin dapat:

1. Login.
2. Membuat client.
3. Membuat project.
4. Menghubungkan project ke client.
5. Membuat invoice.
6. Menambahkan invoice item.
7. Mendownload invoice PDF.
8. QR invoice dapat diverifikasi.
9. Mencatat pembayaran.
10. Sistem menghitung paid/outstanding.
11. Membuat receipt.
12. Mendownload receipt PDF.
13. QR receipt dapat diverifikasi.
14. Melihat semua project lama.
15. Melihat semua invoice dan receipt.
16. Memfilter archive.
17. Logout.

Public user dapat:
1. Scan QR.
2. Membuka halaman `/verif/:token`.
3. Melihat status validitas dokumen.
4. Melihat informasi dokumen yang aman untuk publik.
5. Tidak dapat mengakses data admin.

## 39. Future Development

Kemungkinan pengembangan:
- quotation;
- proposal tracking;
- automatic invoice email;
- WhatsApp delivery;
- client portal;
- recurring invoice;
- maintenance subscription;
- revenue analytics;
- expenses;
- payment gateway;
- notification;
- multiple admin;
- role-based permission;
- document version history;
- certified electronic signature;
- automatic backup;
- export CSV/Excel;
- finance dashboard.

## 40. Kesimpulan

Nalaro E-Invoice diposisikan sebagai sistem internal yang ringan untuk menghubungkan:

**Client → Project → Invoice → Payment → Receipt → Archive**

Frontend tetap statis dan ringan di Cloudflare Pages.

Firebase Authentication menangani admin login.

Firestore menangani data.

PDF dibuat di browser.

QR Code menghubungkan dokumen fisik/digital ke halaman verification publik:

`e-invoice.nalaro.digital/verif/:token`

Seluruh desain aplikasi mengikuti identitas visual dan design system Nalaro utama agar terasa sebagai satu ekosistem, bukan aplikasi terpisah.
