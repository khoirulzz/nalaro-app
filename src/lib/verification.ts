import { Capacitor } from '@capacitor/core';
const LEGACY_BASES = new Set([
  'https://e-invoice.nalaro.digital/verif/',
  'https://e-invoice.nalaro.digital/verifi/',
]);

/**
 * Verification QR links always use the public /verifi/<token> route.
 * A configured value may be just a domain/origin; its pathname is normalized.
 */
export function verificationBaseUrl(settings: any = {}, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  const configured = String(settings?.verificationBaseUrl || '').trim();
  const environment = String(import.meta.env.PUBLIC_VERIFICATION_BASE_URL || '').trim();

  const nativeOrigin = Capacitor.isNativePlatform() ? 'https://order.nalaro.digital' : origin;
  let raw = configured || environment || nativeOrigin;
  if (configured && LEGACY_BASES.has(configured) && origin) {
    try {
      if (new URL(nativeOrigin).hostname !== 'e-invoice.nalaro.digital') raw = nativeOrigin;
    } catch { /* validation below returns the user-facing error */ }
  }

  if (!raw) throw new Error('Alamat verifikasi belum tersedia. Isi domain verifikasi di Pengaturan.');

  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('URL verifikasi harus berupa alamat lengkap https://domain/.'); }

  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Gunakan URL HTTP/HTTPS tanpa kredensial, query, atau fragment untuk verifikasi.');
  }

  // Never let a QR point to the app root/login. The public registry route is fixed.
  url.pathname = '/verifi/';
  return url.href;
}

export function verificationUrl(token: unknown, settings: any = {}, origin?: string) {
  const value = String(token || '').trim();
  if (!value) return '';
  return verificationBaseUrl(settings, origin) + encodeURIComponent(value);
}

export function verificationToken(location: Pick<Location, 'pathname' | 'search'>) {
  const query = new URLSearchParams(location.search).get('token');
  if (query) return query;

  const parts = location.pathname.split('/').filter(Boolean);
  if (!['verifi', 'verif'].includes(parts[0] || '') || !parts[1]) return '';
  try { return decodeURIComponent(parts[1]); } catch { return ''; }
}
