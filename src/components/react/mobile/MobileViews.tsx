import React, { lazy, Suspense, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';

const VerificationApp = lazy(() => import('../VerificationApp'));
const ALLOWED_HOSTS = new Set(['order.nalaro.digital', 'nalaro.digital', 'www.nalaro.digital', 'e-invoice.nalaro.digital']);

function parseVerificationToken(value: string): string {
  const text = value.trim();
  if (/^[\w-]{20,64}$/.test(text)) return text;
  let url: URL;
  try { url = new URL(text); } catch { throw new Error('QR tidak memuat tautan verifikasi Nalaro yang valid.'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('QR bukan berasal dari domain verifikasi Nalaro.');
  const match = url.pathname.match(/^\/verifi?\/([\w-]{20,64})\/?$/);
  const token = match?.[1] || url.searchParams.get('token');
  if (!token || !/^[\w-]{20,64}$/.test(token) || !['/verifi/', '/verif/'].some(prefix => url.pathname.startsWith(prefix)))
    throw new Error('Token verifikasi QR tidak ditemukan.');
  return token;
}

export default function MobileFinance() {
  return (
    <section className="admin-page">
      <header className="page-header"><div><p className="page-eyebrow"><span>Finance</span></p><h1>Keuangan</h1></div></header>
      <div className="mobile-menu-list">
        <NavLink to="/invoices" className="mobile-menu-item"><strong>Invoices</strong><span>Tagihan proyek ↗</span></NavLink>
        <NavLink to="/receipts" className="mobile-menu-item"><strong>Receipts</strong><span>Kuitansi pembayaran ↗</span></NavLink>
      </div>
    </section>
  );
}

export function MobileMore({ logout }: { logout: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scan = async () => {
    if (busy) return;
    if (!Capacitor.isNativePlatform()) { setError('Pemindai hanya tersedia pada aplikasi Android.'); return; }
    setBusy(true); setError('');
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.ALL,
        scanInstructions: 'Arahkan kamera ke QR verifikasi Nalaro',
        scanButton: true,
        scanText: 'Pindai QR',
      });
      if (result.ScanResult) navigate('/verify/' + encodeURIComponent(parseVerificationToken(result.ScanResult)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'QR tidak berhasil dipindai.');
    } finally { setBusy(false); }
  };
  return (
    <section className="admin-page">
      <header className="page-header"><div><p className="page-eyebrow"><span>More</span></p><h1>Lainnya</h1></div></header>
      {error && <p className="document-error" role="alert">{error}</p>}
      <div className="mobile-menu-list">
        <button className="mobile-menu-item" disabled={busy} onClick={scan}>
          <strong>{busy ? 'Membuka kamera…' : 'Pindai QR Verifikasi'}</strong><span>Periksa invoice atau receipt melalui kamera ↗</span>
        </button>
        <NavLink to="/clients" className="mobile-menu-item"><strong>Clients</strong><span>Klien dan kontak ↗</span></NavLink>
        <NavLink to="/archive" className="mobile-menu-item"><strong>Archive</strong><span>Arsip dokumen ↗</span></NavLink>
        <NavLink to="/settings" className="mobile-menu-item"><strong>Settings</strong><span>Pengaturan dan identitas ↗</span></NavLink>
        <button onClick={logout} className="mobile-menu-item text-left text-red-500"><strong>Keluar (Logout)</strong></button>
      </div>
    </section>
  );
}

export function MobileVerify() {
  const { token } = useParams();
  const navigate = useNavigate();
  return <section className="admin-page">
    <button type="button" className="text-link" onClick={() => navigate(-1)}>← Kembali</button>
    <Suspense fallback={<div className="admin-boot">Memeriksa dokumen…</div>}>
      <VerificationApp token={token} />
    </Suspense>
  </section>;
}
