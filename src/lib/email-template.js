// Shared by the mailbox Worker and the compose preview. No user HTML is trusted.
export const EMAIL_ASSET_ORIGIN = 'https://order.nalaro.digital';
export const EMAIL_BANNER_URL = `${EMAIL_ASSET_ORIGIN}/brand/nalaro-email-banner.jpg`;
const WEBSITE = 'https://www.nalaro.digital';
const profiles = {
  'hello@nalaro.digital': { label: 'CLIENT CONVERSATION', team: 'Nalaro', note: 'Percakapan dan dukungan untuk proyek Anda.' },
  'business@nalaro.digital': { label: 'BUSINESS & PARTNERSHIPS', team: 'Nalaro Business', note: 'Kerja sama, penawaran, dan ide berikutnya.' },
  'billing@nalaro.digital': { label: 'BILLING UPDATE', team: 'Nalaro Billing', note: 'Informasi tagihan dan pembayaran proyek Anda.' },
};
export function isBrandedMailbox(address) { return Object.hasOwn(profiles, String(address).trim().toLowerCase()); }
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const currency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const date = (value) => {
  if (!value) return '—';
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
};

/** Render a safe HTML email plus a complete plain-text alternative. */
export function renderOutgoingEmail({ from, subject, text, billing, year = new Date().getUTCFullYear() }) {
  const address = String(from).trim().toLowerCase();
  const profile = isBrandedMailbox(address) ? profiles[address] : undefined;
  if (!profile) return { text };
  const detail = address === 'billing@nalaro.digital' ? billing : undefined;
  const label = detail ? (detail.kind === 'invoice' ? 'INVOICE' : 'PAYMENT RECEIPT') : profile.label;
  const title = detail ? (detail.kind === 'invoice' ? 'Your project invoice' : 'Payment received. Thank you.') : subject;
  const status = detail ? (detail.kind === 'receipt' ? 'PAID' : ({ paid: 'PAID', unpaid: 'UNPAID', partial: 'PARTIALLY PAID', cancelled: 'CANCELLED' }[detail.status] || 'INVOICE')) : '';
  const paid = status === 'PAID';
  const rows = detail ? [
    ['Document', detail.number], ['Project', detail.project],
    [detail.kind === 'invoice' ? 'Invoice total' : 'Amount received', currency(detail.amount)],
    ...(detail.kind === 'invoice' ? [['Amount due', currency(detail.outstanding)], ['Due date', date(detail.date)]] : [['Payment date', date(detail.date)]]),
    ...(detail.relatedInvoice ? [['Related invoice', detail.relatedInvoice]] : []),
  ].filter(([, value]) => value) : [];
  const verification = detail?.verificationToken && /^[a-zA-Z0-9_-]{10,80}$/.test(detail.verificationToken)
    ? `${EMAIL_ASSET_ORIGIN}/verifi/${detail.verificationToken}` : '';
  const summary = detail ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e7e7e7;background:#fafafa;margin:24px 0;"><tr><td style="padding:20px;"><p style="margin:0 0 14px;"><span style="display:inline-block;background:${paid ? '#e8f5ed' : '#fff0e9'};color:${paid ? '#176339' : '#a83210'};padding:6px 10px;font-size:11px;font-weight:bold;letter-spacing:1px;">${status}</span></p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([key, value]) => `<tr><td style="padding:7px 12px 7px 0;font-size:13px;color:#626262;vertical-align:top;">${escape(key)}</td><td align="right" style="padding:7px 0;font-size:14px;font-weight:bold;color:#151515;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">${escape(value)}</td></tr>`).join('')}</table></td></tr></table><p class="mail-muted" style="font-size:13px;color:#626262;line-height:1.7;">The PDF document is attached to this email.${verification ? ' You can also verify its authenticity online.' : ''}</p>${verification ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#ff5b2e" style="border-radius:4px;"><a href="${verification}" style="display:inline-block;padding:13px 20px;color:#171717;font-weight:bold;font-size:14px;text-decoration:none;">Verify ${detail.kind === 'invoice' ? 'invoice' : 'payment receipt'} &rarr;</a></td></tr></table>` : ''}` : '';
  const paragraphs = String(text).split(/\r?\n\s*\r?\n/).map((part) => `<p style="margin:0 0 18px;line-height:1.75;overflow-wrap:anywhere;word-break:break-word;">${escape(part).replace(/\r?\n/g, '<br>')}</p>`).join('');
  const preview = detail ? `${label} ${detail.number} · ${currency(detail.amount)} · ${status}` : String(text).replace(/\s+/g, ' ').slice(0, 140);
  const language = detail ? 'en' : 'id';
  const html = `<!doctype html>
<html lang="${language}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(subject)}</title>
<style>@media only screen and (max-width:620px){.mail-shell{width:100%!important}.mail-pad{padding:26px 22px!important}.mail-outer{padding:16px 8px!important}.mail-title{font-size:25px!important}}@media(prefers-color-scheme:dark){.mail-background{background:#101010!important}.mail-card{background:#171717!important;color:#f5f5f5!important}.mail-title{color:#f5f5f5!important}.mail-muted{color:#bdbdbd!important}.mail-footer a{color:#ff8c6c!important}}</style></head>
<body class="mail-background" style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#252525;">
<div lang="${language}" dir="ltr" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(preview)}</div>
<table lang="${language}" dir="ltr" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="mail-outer" align="center" style="padding:36px 16px;">
<table class="mail-shell" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;">
<tr><td class="mail-card" bgcolor="#ffffff" style="border:1px solid #e5e5e3;border-top:4px solid #ff5b2e;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="mail-pad" style="padding:32px 36px 22px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="40" bgcolor="#0b0c0a" style="border-radius:6px;"><a href="${WEBSITE}"><img src="${EMAIL_ASSET_ORIGIN}/brand/nalaro.png" width="40" height="40" alt="Visit Nalaro" style="display:block;border:0;"></a></td><td style="padding-left:12px;font-size:24px;font-weight:bold;letter-spacing:-1px;">Nalaro<span style="color:#ff5b2e;">.</span></td></tr></table></td></tr>
<tr><td class="mail-pad" style="padding:12px 36px 32px;"><p style="margin:0 0 18px;"><span style="display:inline-block;background:#fff0e9;color:#a83210;padding:7px 11px;font-size:11px;font-weight:bold;letter-spacing:1.3px;">${label}</span></p><h1 class="mail-title" style="margin:0 0 24px;font-size:29px;line-height:1.25;letter-spacing:-.6px;color:#151515;overflow-wrap:anywhere;word-break:break-word;">${escape(title)}</h1><div style="font-size:15px;">${paragraphs}</div>${summary}</td></tr>
<tr><td style="border-top:1px solid #ededeb;"><a href="${WEBSITE}"><img src="${EMAIL_BANNER_URL}" width="600" alt="Nalaro — Build everything you want! Visit our website." style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
</table></td></tr>
<tr><td class="mail-pad mail-muted mail-footer" lang="id" align="left" style="padding:24px 36px;color:#626262;font-size:12px;line-height:1.8;"><p style="margin:0 0 8px;font-weight:bold;font-size:13px;">${profile.team}</p><p style="margin:0 0 12px;">${profile.note}<br>Balas email ini untuk melanjutkan percakapan dengan tim kami.</p><p style="margin:0;"><a href="${WEBSITE}" style="color:#a83210;text-decoration:underline;">Website Nalaro</a><span aria-hidden="true"> &nbsp;·&nbsp; </span><a href="mailto:${address}" style="color:#a83210;text-decoration:underline;">${address}</a></p><p style="margin:12px 0 0;font-size:11px;">&copy; ${year} Nalaro. All rights reserved.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { html, text: `${text}${detail ? '\n\n' + status + '\n' + rows.map(([key, value]) => key + ': ' + value).join('\n') + '\nPDF document attached.' + (verification ? '\nVerify document: ' + verification : '') : ''}\n\n—\n${profile.team}\n${profile.note}\nBalas email ini untuk melanjutkan percakapan.\n${WEBSITE}\n${address}\n© ${year} Nalaro.` };
}
