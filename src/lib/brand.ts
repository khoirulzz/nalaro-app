export const NALARO_WEBSITE = 'https://www.nalaro.digital';
export const NALARO_EMAIL = 'business@nalaro.digital';

/** Refresh company contact details from settings saved before the domain change. */
export function brandContact(settings: { website?: unknown; email?: unknown } | null = {}) {
  let website = String(settings?.website || '').trim() || NALARO_WEBSITE;
  try {
    const hostname = new URL(website).hostname.toLowerCase();
    if (['nalaro.one', 'www.nalaro.one', 'nalaro.digital', 'www.nalaro.digital', 'nalaro.web.id', 'www.nalaro.web.id'].includes(hostname)) website = NALARO_WEBSITE;
  } catch { website = NALARO_WEBSITE; }
  const email = String(settings?.email || '').trim();
  return { website, email: /^[^\s@]+@nalaro\.digital$/i.test(email) ? email : NALARO_EMAIL };
}
