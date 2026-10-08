# PRD — Nalaro Project Desk Mobile

**Product:** Nalaro Project Desk Mobile  
**Platform awal:** Android  
**Platform lanjutan:** iOS  
**Technology:** Astro + React + Capacitor + Firebase + Cloudflare + Capgo Updater  
**OTA:** Self-hosted menggunakan `@capgo/capacitor-updater`, Cloudflare Worker, dan R2  
**Status:** Planning / Ready for Implementation  
**Versi PRD:** 1.0  
**Tanggal:** 8 Oktober 2026

---

# 1. Ringkasan Produk

Nalaro Project Desk Mobile adalah aplikasi mobile resmi untuk mengakses dan mengelola seluruh sistem administrasi internal Nalaro dari smartphone.

Aplikasi bukan aplikasi baru yang berdiri terpisah dari NalaroTrans, melainkan **native mobile distribution dari codebase NalaroTrans yang sama** menggunakan Capacitor.

Aplikasi harus mempertahankan seluruh fungsi utama web:

- Dashboard
- Clients
- Projects
- Invoices
- Payments
- Receipts
- Archive
- Settings
- Mail Desk
- PDF Invoice
- PDF Receipt
- QR Verification

Sambil menambahkan kemampuan perangkat mobile seperti:

- native file system;
- native share sheet;
- QR scanner;
- push notification;
- network awareness;
- haptic feedback;
- secure mobile session;
- native splash screen;
- native status/navigation bar;
- OTA update.

Aplikasi tidak boleh sekadar menjadi WebView yang membuka `order.nalaro.digital`.

HTML, CSS, JavaScript, React, dan aset Nalaro harus dibundel di dalam APK melalui Capacitor.

---

# 2. Latar Belakang

NalaroTrans saat ini merupakan Project Desk berbasis Astro + React dengan Firebase Authentication, Firestore, Mailbox Worker, Cloudflare R2, Resend, jsPDF, dan QR verification.

Versi web telah memiliki business flow:

```text
Client
  ↓
Project
  ↓
Invoice
  ↓
Payment
  ↓
Receipt
  ↓
Archive
```

Serta workflow komunikasi:

```text
Nalaro Mail Desk
  ↓
hello@nalaro.digital
business@nalaro.digital
billing@nalaro.digital
admin@nalaro.digital
khoirululum@nalaro.digital
```

Pengelolaan melalui smartphone saat ini masih bergantung pada responsive web.

Mobile app dibutuhkan agar aktivitas administratif cepat seperti mengecek project, mencatat pembayaran, membuat receipt, membaca email, mengirim invoice, dan berbagi PDF dapat dilakukan dengan UX yang lebih sesuai untuk smartphone.

---

# 3. Tujuan Produk

Nalaro Project Desk Mobile harus:

1. Menyediakan hampir seluruh kemampuan NalaroTrans web dalam aplikasi Android.
2. Menggunakan database dan backend yang sama dengan web.
3. Tidak membuat data web dan mobile terpisah.
4. Mempertahankan code reuse setinggi mungkin.
5. Mempertahankan jsPDF dan Mail Desk existing.
6. Memberikan UI khusus mobile, bukan desktop UI yang diperkecil.
7. Mendukung native file save dan share.
8. Mendukung QR scanner.
9. Mendukung email Nalaro secara penuh.
10. Mendukung push notification.
11. Mendukung OTA update tanpa APK baru untuk perubahan web layer.
12. Tidak membutuhkan layanan Capgo Cloud berbayar.
13. Tetap dapat dibangun menjadi APK/AAB melalui GitHub Actions.
14. Aman digunakan bersamaan dengan NalaroTrans web.

---

# 4. Prinsip Produk

Mobile app harus mengikuti prinsip:

**Web-first, mobile-native where useful.**

Artinya business logic, database, PDF, branding, dan Mail Desk tetap berbasis stack web yang sudah terbukti bekerja.

Native API hanya digunakan ketika memberi manfaat nyata.

Contoh:

```text
React UI
        ↓
Capacitor Bridge
        ↓
Android
├── Filesystem
├── Share
├── QR Scanner
├── Notifications
├── Network
├── Haptics
└── App Lifecycle
```

Aplikasi tidak perlu menulis ulang seluruh produk menggunakan React Native atau Kotlin.

---

# 5. Scope Platform

## V1

Target utama:

```text
Android
```

Distribusi awal:

```text
APK
```

Distribusi kemudian dapat menggunakan:

```text
AAB / Google Play
```

## Future

Arsitektur tidak boleh menghalangi:

```text
iOS
```

Namun iOS bukan requirement V1.

---

# 6. Technology Baseline

Web existing tetap menggunakan:

```text
Astro
React
TypeScript
Tailwind
Firebase Authentication
Cloud Firestore
jsPDF
QRCode
DOMPurify
Cloudflare Worker
Cloudflare R2
Resend
```

Mobile shell menggunakan:

```text
Capacitor 8
```

Node baseline:

```text
Node.js >= 22
```

Sesuai requirement project saat ini.

---

# 7. Native Application Identity

Working application name:

```text
Nalaro Project Desk
```

Short name:

```text
Nalaro
```

Package ID yang disarankan:

```text
digital.nalaro.projectdesk
```

Package ID harus dianggap permanen setelah aplikasi production dirilis.

Brand color utama:

```text
#FF5B2E
```

Visual:

```text
Orange
Black
White
Warm gray
```

App icon menggunakan identitas logo Nalaro.

---

# 8. Arsitektur Utama

```text
                     NALARO ECOSYSTEM

                   ┌─────────────────┐
                   │    Firestore    │
                   │ Firebase Auth   │
                   └────────┬────────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼

       NalaroTrans Web              Nalaro Mobile
       Astro + React                Astro + React
       Cloudflare Pages             Capacitor
             │                             │
             └──────────────┬──────────────┘
                            │
                            ▼
                  Shared business data


MAIL

Nalaro Mobile/Web
        │
        │ Firebase ID Token
        ▼
Cloudflare Mailbox Worker
        │
   ┌────┴────┐
   ▼         ▼
  R2       Resend


OTA

GitHub Actions
      │
      ▼
Web Bundle
      │
      ▼
Capgo CLI ZIP
      │
      ▼
Cloudflare R2
      │
      ▼
updates.nalaro.digital
      │
      ▼
@capgo/capacitor-updater
      │
      ▼
Nalaro Mobile
```

---

# 9. Codebase Strategy

Mobile tidak dibuat sebagai repository atau React project terpisah pada V1.

Repository:

```text
hulumzz/nalaro-trans
```

Struktur target:

```text
nalaro-trans/
│
├── android/
│
├── public/
│
├── src/
│   ├── components/
│   │   ├── react/
│   │   └── mobile/
│   │
│   ├── lib/
│   │
│   ├── platform/
│   │   ├── files.ts
│   │   ├── share.ts
│   │   ├── network.ts
│   │   ├── notifications.ts
│   │   └── updater.ts
│   │
│   └── pages/
│
├── workers/
│   ├── mailbox/
│   └── updater/
│
├── capacitor.config.ts
├── package.json
└── ...
```

Business logic tidak boleh diduplikasi khusus mobile jika dapat digunakan bersama.

---

# 10. Mobile UI Strategy

Aplikasi harus memiliki mode mobile khusus.

Tidak diperbolehkan hanya menampilkan sidebar desktop existing pada layar kecil.

Navigation utama:

```text
┌─────────────────────────────┐
│ NALARO                 ●    │
├─────────────────────────────┤
│                             │
│         PAGE CONTENT        │
│                             │
├─────────────────────────────┤
│ Home  Projects Finance Mail │
│                    More     │
└─────────────────────────────┘
```

Bottom navigation:

```text
Home
Projects
Finance
Mail
More
```

## Finance

Berisi:

```text
Invoices
Payments
Receipts
```

## More

Berisi:

```text
Clients
Archive
Settings
Account
App Information
```

---

# 11. Mobile Design Direction

Mobile harus tetap mempertahankan identitas visual web Nalaro.

Namun komponen disesuaikan dengan touch interface.

Minimum touch target:

```text
44–48 px
```

Gunakan:

- bottom sheet untuk quick actions;
- sticky primary action;
- card untuk informasi ringkas;
- list untuk data;
- modal fullscreen untuk form panjang;
- status badge existing;
- skeleton/loading state;
- safe-area awareness;
- native-like transition secukupnya.

Hindari:

- sidebar desktop;
- tabel horizontal lebar;
- hover-dependent UI;
- tombol terlalu kecil;
- dropdown desktop yang sulit digunakan;
- nested scrolling yang tidak diperlukan.

---

# 12. Authentication

Authentication tetap menggunakan:

```text
Firebase Authentication
Email + Password
```

Mobile menggunakan akun yang sama dengan web.

V1 tetap mendukung akun:

```text
admin@nalaro.digital
```

Password:

- tidak disimpan manual;
- tidak disimpan di source code;
- tidak dikirim ke backend Nalaro;
- dikelola Firebase Authentication.

Session harus tetap aktif setelah aplikasi ditutup selama Firebase session masih valid.

Logout harus:

```text
Firebase signOut
→ clear sensitive local UI state
→ kembali ke Login
```

---

# 13. Security Hardening

Sebelum aplikasi didistribusikan lebih luas dari perangkat internal, akses admin Firestore harus ditingkatkan dari pengecekan email saja menjadi salah satu:

```text
Firebase Custom Claim
admin == true
```

atau:

```text
UID admin yang diizinkan
```

Mailbox Worker juga harus mengikuti identitas admin yang sama.

Secret berikut tidak pernah masuk APK:

```text
RESEND_API_KEY
R2 credential
Cloudflare API token
Firebase service-account private key
OTA signing private key
```

Firebase client config bukan server secret dan dapat tetap berada pada client application.

---

# 14. Dashboard

Home mobile menampilkan ringkasan:

```text
Active Projects
Waiting Payment
Paid This Month
Overdue Invoice
Completed Projects
```

Dilanjutkan:

```text
Recent Projects
Recent Invoices
Recent Payments
```

Quick action:

```text
+ New Project
+ New Client
+ New Invoice
+ Record Payment
+ Compose Email
```

Dashboard mobile harus memprioritaskan actionable information dibanding statistik dekoratif.

---

# 15. Client Management

Mobile harus mendukung:

```text
List Client
Search
View Detail
Create
Edit
Archive/Delete sesuai destructive-operation policy
```

Client detail menampilkan:

```text
Name
PIC
Email
WhatsApp
Address
Notes
Projects
Invoices
Receipts
```

Email dan WhatsApp dapat diberikan native action:

```text
Email → mailto:
WhatsApp → external application/deep link
```

---

# 16. Project Management

Mobile mendukung:

```text
List Project
Search
Filter
View
Create
Edit
Change Status
View Client
View Related Invoice
```

Status:

```text
Planning
In Progress
Review
Completed
Cancelled
```

Project number tetap mengikuti invariant existing:

```text
NAL/PRJ/YYYY/{12-char Firestore suffix}
```

Mobile tidak boleh membuat nomor menggunakan `Date.now()`.

---

# 17. Invoice Management

Mobile harus dapat:

```text
Create Invoice
View Invoice
Search Invoice
Filter Invoice
Generate PDF
Save PDF
Share PDF
Compose billing email
Record payment
View payments
Issue receipt
```

Invoice dan `public_documents` wajib dibuat dalam satu atomic Firestore write batch.

Mobile tidak boleh memiliki implementasi invoice write yang berbeda dengan invariant web.

---

# 18. Payment Management

Payment menjadi first-class view di mobile.

Finance:

```text
Finance
├── Invoices
├── Payments
└── Receipts
```

Payment detail:

```text
Invoice
Client
Amount
Payment Date
Payment Method
Reference
Receipt Status
```

Pencatatan payment wajib memakai Firestore transaction.

Transaction wajib:

```text
read current invoice
↓
validate status
↓
validate current outstanding
↓
create payment
↓
update invoice balance
↓
update invoice status
↓
update public document
↓
atomic commit
```

Mobile dilarang menghitung balance final dari data UI/cache.

---

# 19. Receipt Management

Satu payment hanya boleh memiliki satu receipt.

Invariant:

```text
receipt.id == payment.id
```

Penerbitan receipt harus menggunakan Firestore transaction.

Transaction harus mengecek:

```text
payment exists
invoice exists
receipt belum exists
```

Kemudian membuat:

```text
receipt
+
public_documents registry
```

secara atomic.

---

# 20. Record Identifier

Mobile wajib mengikuti invariant repo:

```text
Firestore generated document ID
        ↓
first 12 characters
        ↓
human-facing record suffix
```

Contoh:

```text
NAL/INV/2026/A8DF2991CC12
NAL/RCPT/2026/F39B3400AE21
CLI-B7FAD9103C23
```

Tidak menggunakan:

```text
Date.now()
Math.random()
counter lokal
```

sebagai identifier utama.

Tanggal bisnis menggunakan:

```text
Asia/Jakarta
```

---

# 21. Destructive Operations

Ini merupakan launch gate penting.

Current web cascade deletion masih bergantung pada data relationship yang sudah dimuat client.

Untuk penggunaan simultan web + mobile, hard-delete langsung dari mobile tidak boleh diluncurkan sebelum memiliki strong referential-integrity boundary.

Pilihan implementasi yang direkomendasikan:

```text
Soft Delete / Archive
```

dengan:

```text
deletedAt
deletedBy
isDeleted
```

Alternatif:

```text
Trusted server endpoint
```

untuk melakukan cascade deletion secara terkontrol.

Sampai salah satu mekanisme tersedia, mobile tidak boleh melakukan direct cascade hard-delete terhadap:

```text
Client
Project
Invoice
```

Permanent delete dapat tetap menjadi administrative maintenance operation.

---

# 22. PDF Engine

Engine PDF existing tetap dipertahankan:

```text
jsPDF
QRCode
Canvas
Image
FileReader
```

Karena Capacitor menyediakan browser/WebView runtime, engine tidak perlu ditulis ulang.

Yang perlu diubah hanya distribution layer.

Current:

```text
PDF
→ browser download anchor
```

Native:

```text
PDF
→ Blob
→ Filesystem
→ Cache/Documents
→ File Viewer / Share
```

Action PDF:

```text
Preview
Save
Share
Email
```

Invoice dan receipt harus memiliki output visual identik dengan versi web.

---

# 23. Native File Handling

Buat abstraction:

```text
src/platform/files.ts
```

API internal misalnya:

```text
saveDocument()
openDocument()
shareDocument()
downloadAttachment()
```

Pada Web:

```text
Browser Blob + anchor
```

Pada Capacitor:

```text
Capacitor Filesystem
+
native Share
```

Dengan demikian `pdf.ts` tidak perlu mengetahui apakah aplikasi berjalan di browser atau Android.

---

# 24. QR Verification

Public verification tetap berada di web.

QR invoice/receipt tetap membuka:

```text
https://order.nalaro.digital/verifi/{token}
```

Client tidak perlu menginstal Nalaro Mobile.

Mobile app mendapatkan fitur tambahan:

```text
Scan Document
```

Flow:

```text
QR Scanner
    ↓
read verification URL
    ↓
validate nalaro.digital host
    ↓
extract token
    ↓
load verification information
```

QR scanner tidak boleh otomatis membuka domain asing.

---

# 25. Mail Desk

Mail merupakan core feature mobile.

Mailbox existing tetap menggunakan:

```text
Cloudflare Worker
R2
Resend
Firebase ID Token
```

Mobile harus mendukung seluruh mailbox:

```text
hello@nalaro.digital
business@nalaro.digital
billing@nalaro.digital
admin@nalaro.digital
khoirululum@nalaro.digital
```

Folder:

```text
Inbox
Starred
Sent
Drafts
Trash
```

Feature parity:

```text
Read
Unread
Star
Search
Compose
Reply
Save Draft
Send
Move to Trash
Restore
Delete
Attachment
Download attachment
Raw EML where required
```

---

# 26. Billing Email Integration

Invoice/receipt flow harus tetap mendukung:

```text
Generate PDF
      ↓
Create Mail Draft
      ↓
billing@nalaro.digital
      ↓
Attach PDF
      ↓
Open Compose
      ↓
Send
```

Branding rules existing tetap berlaku.

Branded:

```text
hello@nalaro.digital
business@nalaro.digital
billing@nalaro.digital
```

Plain/unbranded:

```text
admin@nalaro.digital
khoirululum@nalaro.digital
```

---

# 27. Email HTML Security

Received email HTML tidak boleh dirender mentah.

Tetap menggunakan sanitization.

Default message view:

```text
safe/plain content
```

Formatted view dapat tersedia dengan:

```text
sanitized HTML
restricted iframe/container
external tracker blocked
unsafe navigation blocked
```

External URL harus membutuhkan user action.

---

# 28. Push Notification

Mobile notification digunakan untuk:

```text
New Email
Important Billing Event
Future Project Reminder
Future Invoice Due Reminder
```

V1 prioritas:

```text
New Email
```

Flow:

```text
Incoming email
      ↓
Cloudflare Email Worker
      ↓
R2
      ↓
Notification service
      ↓
Android
      ↓
tap
      ↓
Nalaro Mail Desk
      ↓
specific message
```

Notification tidak menampilkan seluruh isi email.

Payload cukup:

```text
mailbox
sender
subject
messageId
```

Sensitive body tetap diambil setelah aplikasi dibuka dan user terautentikasi.

---

# 29. Native Network Awareness

Gunakan native network status.

UI harus menampilkan:

```text
Offline
Connection lost
Back online
```

Critical operations dinonaktifkan ketika offline:

```text
Create Invoice
Record Payment
Issue Receipt
Send Email
Destructive Operation
```

Read-only screen dapat menggunakan data yang sudah tersedia di memory/cache.

Financial writes tidak boleh sengaja diantrekan sebagai offline mutation.

---

# 30. Native Capabilities V1

Native shell pertama sebaiknya sudah menyertakan capability yang diperkirakan akan digunakan agar penambahan fitur JavaScript berikutnya dapat dikirim melalui OTA.

Baseline:

```text
@capacitor/app
@capacitor/filesystem
@capacitor/share
@capacitor/network
@capacitor/haptics
@capacitor/keyboard
@capacitor/status-bar
@capacitor/system-bars
@capacitor/splash-screen
@capacitor/barcode-scanner
@capacitor/push-notifications
@capacitor/local-notifications
@capgo/capacitor-updater
```

Privacy screen dan biometric lock dapat ditambahkan setelah plugin yang dipilih divalidasi terhadap Capacitor version yang digunakan.

---

# 31. OTA Update Strategy

Nalaro **tidak menggunakan Capgo Cloud**.

Digunakan:

```text
@capgo/capacitor-updater
```

sebagai updater native.

Infrastructure OTA:

```text
GitHub Actions
      ↓
Astro build
      ↓
Capgo CLI bundle zip
      ↓
SHA-256 checksum
      ↓
Cloudflare R2
      ↓
Cloudflare Worker
      ↓
updates.nalaro.digital
      ↓
Nalaro Mobile
```

---

# 32. OTA Server

Subdomain:

```text
updates.nalaro.digital
```

Worker:

```text
workers/updater/
```

R2 bucket yang disarankan:

```text
nalaro-mobile-updates
```

Bundle structure:

```text
bundles/
├── production/
│   ├── 1.0.1.zip
│   ├── 1.0.2.zip
│   └── 1.0.3.zip
│
└── beta/
    ├── 1.0.4-beta.1.zip
    └── 1.0.4-beta.2.zip
```

Update endpoint:

```text
POST https://updates.nalaro.digital/api/updates
```

Response ketika tersedia update:

```json
{
  "version": "1.0.3",
  "url": "https://updates.nalaro.digital/bundles/production/1.0.3.zip",
  "checksum": "SHA256..."
}
```

Bundle harus dibuat menggunakan Capgo CLI agar struktur ZIP kompatibel dengan updater.

---

# 33. OTA Channel

Minimum dua channel:

```text
beta
production
```

## Beta

Digunakan untuk:

```text
developer device
testing device
pre-release validation
```

## Production

Digunakan untuk aplikasi utama.

Flow:

```text
develop
   ↓
beta OTA
   ↓
test
   ↓
promote
   ↓
production OTA
```

Production tidak boleh otomatis mendapatkan setiap commit ke repository.

---

# 34. OTA Application Behavior

Default strategy:

```text
background download
+
activate after application restart/background cycle
```

Hindari force reload ketika admin sedang mengisi:

```text
invoice
payment
email
project
```

Normal update:

```text
App open
↓
check update
↓
download silently
↓
continue working
↓
next safe restart
↓
new bundle active
```

Critical update dapat memiliki flow khusus di masa depan.

---

# 35. OTA Health Check & Rollback

`CapacitorUpdater.notifyAppReady()` wajib dipanggil pada setiap app launch.

Pemanggilan dilakukan segera setelah JavaScript bundle berhasil mulai berjalan.

Jangan menunggu:

```text
Firestore request
Firebase remote request
Mailbox API
Dashboard loading
```

sebelum memanggilnya.

Tujuannya agar updater dapat menentukan bahwa bundle berhasil dieksekusi.

Jika bundle gagal memulai aplikasi dan tidak menjadi ready dalam timeout updater, aplikasi harus dapat kembali ke previous/builtin bundle.

---

# 36. OTA Integrity

Setiap bundle OTA wajib memiliki:

```text
semantic version
SHA-256 checksum
release timestamp
channel
native compatibility information
```

Checksum dibuat pada proses CI.

Updater harus menolak bundle rusak atau mismatch.

OTA endpoint hanya menggunakan:

```text
HTTPS
```

Tidak menggunakan HTTP production.

---

# 37. Native vs OTA Version

Dibedakan:

## Native Version

Contoh:

```text
1.0.0
```

Berubah ketika:

```text
Capacitor upgrade
native plugin added
native plugin upgraded
AndroidManifest changed
Gradle dependency changed
native permissions changed
Android Kotlin/Java changed
```

Membutuhkan APK/AAB baru.

## Bundle Version

Contoh:

```text
1.0.1
1.0.2
1.0.3
```

Dapat berubah melalui OTA ketika hanya menyentuh:

```text
React
Astro
HTML
CSS
JS/TS
Mail UI
PDF layout
forms
validation
branding
business logic web layer
```

---

# 38. Native Compatibility Guard

OTA server wajib mengetahui native version/build yang digunakan perangkat.

Jangan mengirim bundle yang membutuhkan native plugin baru kepada binary lama.

Contoh:

```text
APK native 1.0.0
├── Filesystem
├── Share
├── QR
└── Updater
```

Bundle yang membutuhkan plugin baru:

```text
Biometric 1.1
```

tidak boleh diberikan ke:

```text
native 1.0.0
```

sampai APK 1.1.0 terpasang.

---

# 39. GitHub Actions

Workflow target:

```text
Push / Merge
      ↓
Install
      ↓
Type Check
      ↓
Tests
      ↓
Build Astro
      ↓
Determine release type
   ┌──┴───────────┐
   │              │
   ▼              ▼
 Web-only       Native
   │              │
 OTA build      Gradle
   │              │
 Capgo ZIP      APK/AAB
   │
 checksum
   │
 upload R2
```

Existing test suite tetap dijalankan:

```text
npm run check
npm run test:pdf
npm run test:orders
npm run test:ui
npm run test:rules
npm run test:mailbox
npm run test:mailbox-ui
npm run test:email
```

Tambahkan:

```text
test:mobile
test:updater
```

---

# 40. Release Policy

OTA production hanya boleh dilakukan jika:

```text
TypeScript check PASS
web build PASS
tests PASS
mobile smoke test PASS
bundle checksum created
native compatibility PASS
beta validation PASS
```

Native APK production hanya boleh dibuat dari tagged release.

Contoh:

```text
mobile-v1.0.0
mobile-v1.1.0
```

---

# 41. App Information Screen

Route/view:

```text
More → App Information
```

Menampilkan:

```text
App Version
Native Build
OTA Bundle Version
Update Channel
Last Update Check
Current Connection
Firebase Project
```

Action:

```text
Check for Updates
```

Development builds dapat memiliki:

```text
Switch Beta/Production
View Installed Bundles
Reset to Built-in Bundle
```

Fitur debug tersebut tidak perlu muncul pada production regular user.

---

# 42. Settings Mobile

Settings existing tetap tersedia.

Tambahan mobile:

```text
Notification preference
App lock
Update channel (debug only)
Clear temporary PDF/cache
App information
```

Business settings tetap berasal dari:

```text
settings/general
```

Tidak dibuat database settings kedua.

---

# 43. App Lifecycle

Ketika app masuk background:

```text
save harmless UI state
apply pending OTA if safe
lock sensitive view if app-lock enabled
```

Ketika app kembali active:

```text
verify Firebase session
refresh required data
check network
check notifications/deep links
```

Form penting tidak boleh hilang hanya karena aplikasi berpindah sebentar ke background.

---

# 44. Deep Linking

Aplikasi harus dipersiapkan untuk deep link:

```text
nalaro://mail/{id}
nalaro://project/{id}
nalaro://invoice/{id}
nalaro://receipt/{id}
```

Universal/app links dapat ditambahkan di fase berikutnya.

Push notification email harus dapat membuka message terkait.

---

# 45. Search & Data Loading

Current `getDocs()` seluruh collection dapat digunakan pada tahap awal karena data masih terbatas, tetapi mobile architecture harus memungkinkan migrasi ke:

```text
query()
orderBy()
limit()
startAfter()
```

Saat jumlah records bertambah.

Mailbox tetap menggunakan cursor pagination existing.

---

# 46. Performance Target

Cold launch target:

```text
UI shell terlihat secepat mungkin
```

Jangan menunggu semua collection selesai dimuat sebelum menampilkan application shell.

Gunakan lazy loading untuk:

```text
Mail Desk
PDF engine
QR scanner
heavy modules
```

PDF dan mailbox bundle tidak perlu menghambat initial launch.

---

# 47. Error Handling

Jangan hanya menggunakan generic:

```text
Something went wrong
```

Financial error harus jelas.

Contoh:

```text
Invoice sudah lunas.
Pembayaran melebihi sisa tagihan.
Data berubah di perangkat lain.
Koneksi terputus sebelum pembayaran disimpan.
Receipt untuk pembayaran ini sudah diterbitkan.
```

Network failure harus dibedakan dari validation error.

---

# 48. Data Consistency Web ↔ Mobile

Firestore merupakan:

```text
single source of truth
```

Web dan mobile harus membaca collection yang sama.

Invariant yang sudah ada pada repository wajib dipatuhi oleh kedua client.

Khusus:

```text
Invoice + verification registry → atomic batch

Payment + invoice balance + verification status
→ Firestore transaction

Receipt + verification registry
→ Firestore transaction

One payment → one receipt

Record suffix → Firestore ID

Timezone → Asia/Jakarta
```

---

# 49. Public Features

Mobile app tetap merupakan internal application.

Public features seperti:

```text
Order Form
Document Verification
```

tetap berupa web page.

Mobile dapat menyediakan shortcut:

```text
Open Order Form
Share Order Form
Scan Verification QR
```

Tetapi public client tidak wajib memiliki mobile app.

---

# 50. Non-Goals V1

Tidak menjadi target mobile V1:

```text
Payment gateway
Automatic bank reconciliation
Full accounting ledger
Payroll
Inventory
Multi-company support
Client mobile application
Public client login
Video calls
Chat realtime baru
Offline financial mutation
Capgo Cloud paid service
Separate mobile backend
React Native rewrite
```

---

# 51. Implementation Phases

## Phase 1 — Capacitor Foundation

Implement:

```text
Capacitor 8
Android project
app ID
app icon
splash
system bars
safe area
native detection
GitHub Actions Android build
```

Output:

```text
installable APK
```

---

## Phase 2 — Mobile Shell

Implement:

```text
mobile layout
bottom navigation
mobile header
responsive forms
safe area
native back button behavior
```

Existing desktop UI tidak boleh rusak.

---

## Phase 3 — Native File Integration

Implement:

```text
Filesystem
Share
PDF save
PDF share
mail attachment save/share
```

Regression test PDF wajib dilakukan.

---

## Phase 4 — Core Feature Parity

Validasi:

```text
Dashboard
Clients
Projects
Invoices
Payments
Receipts
Archive
Settings
```

Semua transaction invariant existing harus lolos mobile testing.

---

## Phase 5 — Mail Desk

Implement mobile UX untuk:

```text
Inbox
Sent
Draft
Trash
Starred
Compose
Reply
Attachment
Billing email
```

---

## Phase 6 — QR & Device Features

Implement:

```text
Barcode/QR scanner
Haptics
Network monitor
native share
external links
```

---

## Phase 7 — OTA

Implement:

```text
@capgo/capacitor-updater
Cloudflare updater Worker
R2 bucket
checksum
beta
production
rollback
GitHub Actions deployment
```

Capgo Cloud tidak digunakan.

---

## Phase 8 — Push Notification

Implement:

```text
device registration
mail notification
deep link
notification settings
```

---

## Phase 9 — Security & Polish

Implement:

```text
admin identity hardening
app lock/biometric if selected
privacy screen if selected
cache cleanup
mobile QA
APK signing
production build
```

---

# 52. Testing Matrix

Minimum device classes:

```text
Android small phone
Android standard 6–6.7"
Android large phone
Android tablet/basic large screen
```

Test scenarios:

```text
portrait
keyboard open
slow internet
connection loss
app background/foreground
OTA available
OTA corrupt
Firebase expired token
mail token refresh
large attachment
long project/client names
partial payment
simultaneous web/mobile payment attempt
receipt created from another device
```

---

# 53. Critical Concurrency Test

Mandatory test:

```text
Web opens Invoice A
Mobile opens Invoice A

Outstanding:
Rp1.000.000

Web records:
Rp700.000

Mobile simultaneously records:
Rp700.000
```

Expected:

```text
Only valid transaction succeeds according to current balance.

Second transaction must re-read current invoice.

No outstanding negative value.

No duplicate financial state.
```

Receipt concurrency:

```text
Web + mobile issue receipt for same payment
```

Expected:

```text
Only one receipt exists.
receipt.id == payment.id
```

---

# 54. OTA Failure Test

Scenario:

```text
Production native bundle: 1.0.0
OTA good: 1.0.5
OTA bad: 1.0.6
```

Expected:

```text
1.0.6 downloaded
↓
bundle fails to start
↓
notifyAppReady not reached
↓
updater marks update invalid
↓
known-good bundle/built-in bundle restored
↓
app remains usable
```

---

# 55. Acceptance Criteria V1

Mobile V1 dianggap selesai ketika:

```text
APK dapat diinstal.

Admin dapat login.

Dashboard dapat digunakan.

Client dapat dilihat/dibuat/diedit.

Project dapat dilihat/dibuat/diedit.

Invoice dapat dibuat secara atomic.

Invoice PDF dapat dibuat.

PDF dapat disimpan ke perangkat.

PDF dapat dibagikan menggunakan Android Share Sheet.

Payment dapat dicatat dengan Firestore transaction.

Partial payment bekerja.

Concurrent payment tidak merusak balance.

Receipt dapat diterbitkan.

Receipt tidak dapat duplikat untuk payment yang sama.

Receipt PDF dapat disimpan/share.

QR dapat dipindai melalui kamera.

QR verification valid.

Mail Desk dapat membaca seluruh mailbox.

Email dapat dikirim.

Reply bekerja.

Draft bekerja.

Attachment dapat dibuka/disimpan.

Billing email dapat dibuat langsung dari invoice/receipt.

Network status terdeteksi.

Critical financial writes diblok ketika offline.

OTA self-hosted bekerja tanpa Capgo Cloud.

OTA memiliki checksum.

Beta dan production dapat dipisahkan.

Bad OTA dapat di-recover.

Web application existing tetap berjalan normal.

Data mobile dan web selalu menggunakan Firestore yang sama.
```

---

# 56. Launch Gate

Production mobile tidak dirilis sebelum:

```text
concurrency tests PASS
Firestore rules tests PASS
PDF tests PASS
mailbox tests PASS
OTA rollback test PASS
native compatibility guard PASS
destructive-operation strategy ditetapkan
APK signing tersedia
secrets tidak terdapat dalam APK/repository
```

---

# 57. Future Development

Setelah V1:

```text
Biometric app lock
Privacy screen
Resend delivery webhook
Email push improvements
Project deadline notification
Invoice due notification
Full-text mailbox index
D1 email metadata index
Home screen shortcuts
App widgets
iOS
Google Play distribution
Role-based multiple admins
Activity log
Soft-delete recovery bin
Export/share reporting
```

---

# 58. Product Success Definition

Mobile app berhasil jika penggunaan sehari-hari Nalaro dapat dilakukan tanpa harus membuka laptop untuk tugas administratif rutin.

Target workflow:

```text
Client menghubungi Nalaro
        ↓
buka Nalaro Mobile
        ↓
cek/create project
        ↓
buat invoice
        ↓
share / email invoice
        ↓
payment masuk
        ↓
record payment
        ↓
generate receipt
        ↓
send receipt
        ↓
arsip otomatis tersinkron
```

Semuanya harus muncul secara konsisten di web dan mobile.

---

# 59. Final Architecture Decision

Nalaro Project Desk Mobile menggunakan:

```text
Existing Astro + React codebase
        +
Capacitor 8 native shell
        +
Firebase Auth & Firestore
        +
existing Cloudflare Mailbox Worker
        +
R2 & Resend
        +
jsPDF
        +
Capgo open-source Capacitor Updater
        +
self-hosted Cloudflare OTA
```

Tidak menggunakan:

```text
React Native
Capgo Cloud
mobile backend terpisah
remote website-only WebView
```

Strategi ini dipilih karena memberikan code reuse maksimum, maintenance rendah, native device capability yang cukup, serta OTA update dengan biaya infrastruktur seminimal mungkin.

---

# 60. Kesimpulan

Nalaro Mobile bukan produk kedua.

Nalaro Mobile adalah **mobile-native delivery layer dari Nalaro Project Desk yang sama**.

Web dan Android berbagi:

```text
business logic
database
authentication
PDF
email
branding
verification
```

Capacitor bertugas memberikan native runtime dan akses perangkat.

Capgo Updater bertugas mengganti web bundle melalui OTA.

Cloudflare Worker + R2 menggantikan kebutuhan Capgo Cloud sehingga sistem update tetap berada di bawah kontrol infrastruktur Nalaro.

Dengan arsitektur ini:

```text
Minor / web-layer update
        ↓
OTA

Native capability update
        ↓
new APK/AAB
```

Hasil akhirnya adalah satu ecosystem:

```text
NalaroTrans Web
       +
Nalaro Mobile
       +
Nalaro Mail
       +
Nalaro Document Verification
       +
Nalaro OTA Infrastructure
```

dengan Firestore sebagai source of truth dan Nalaro sebagai pemilik penuh infrastructure serta distribution flow aplikasinya.