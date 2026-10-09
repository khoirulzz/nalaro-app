import PostalMime from 'postal-mime';
import { ApiError, verifyAdmin } from './auth.js';
import { renderOutgoingEmail } from '../../../src/lib/email-template.js';

const MAX_RAW = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 8 * 1024 * 1024;
const MAX_JSON = 12 * 1024 * 1024;
const ID = /^\d{13}-[a-f0-9]{32}$/;
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,63}$/;
const FOLDERS = ['inbox', 'sent', 'drafts', 'trash'];
const encoder = new TextEncoder();
const nowISO = () => new Date().toISOString();
const newId = () => String(9999999999999 - Date.now()).padStart(13, '0') + '-' + crypto.randomUUID().replaceAll('-', '');
const cleanName = (name) => String(name || 'attachment').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180);
const base = (mailbox) => `mail/v1/${encodeURIComponent(mailbox)}/`;
const recordKey = (mailbox, id) => base(mailbox) + `messages/${id}.json`;
const attachmentKey = (mailbox, id, attachment) => base(mailbox) + `files/${id}/${attachment}`;
function requiredEnv(env) {
  if (!env.MAIL_BUCKET || !env.FIREBASE_PROJECT_ID || !env.ADMIN_EMAIL || !env.MAILBOX_ADDRESSES || !env.ALLOWED_ORIGINS) {
    throw new ApiError(503, 'Mailbox belum dikonfigurasi. Lengkapi binding dan variabel Worker.');
  }
}
function addresses(env) {
  const list = String(env.MAILBOX_ADDRESSES || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.some((value) => !EMAIL.test(value))) throw new ApiError(503, 'MAILBOX_ADDRESSES belum valid.');
  return [...new Set(list)];
}
function mailboxFor(url, env) {
  const mailbox = (url.searchParams.get('mailbox') || addresses(env)[0]).toLowerCase();
  if (!addresses(env).includes(mailbox)) throw new ApiError(403, 'Alamat mailbox tidak diizinkan.');
  return mailbox;
}
function summary(record) {
  const { id, mailbox, folder, originalFolder, from, to, subject, createdAt, updatedAt, read, starred, status } = record;
  return { id, mailbox, folder, originalFolder, from, to, subject, createdAt, updatedAt, read, starred, status,
    preview: String(record.text || '').replace(/\s+/g, ' ').slice(0, 100), attachmentCount: record.attachments?.length || 0 };
}
function metadata(record) {
  // Bounded UTF-8 JSON stays below R2's 2KB custom metadata limit.
  const value = summary(record);
  value.from = value.from.slice(0, 120); value.to = value.to.slice(0, 2);
  value.subject = value.subject.slice(0, 120); value.preview = value.preview.slice(0, 80);
  while (encoder.encode(JSON.stringify(value)).length > 1900) { value.subject = value.subject.slice(0, -20); value.preview = ''; }
  return { summary: JSON.stringify(value) };
}
function publicRecord(record) {
  const { resendPayload, ...safe } = record;
  return safe;
}
async function putRecord(env, record, etag) {
  return env.MAIL_BUCKET.put(recordKey(record.mailbox, record.id), JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' }, customMetadata: metadata(record),
    ...(etag ? { onlyIf: { etagMatches: etag } } : { onlyIf: { etagDoesNotMatch: '*' } }),
  });
}
async function getRecord(env, mailbox, id) {
  if (!ID.test(id)) throw new ApiError(400, 'ID email tidak valid.');
  const object = await env.MAIL_BUCKET.get(recordKey(mailbox, id));
  if (!object) throw new ApiError(404, 'Email tidak ditemukan.');
  return { record: await object.json(), etag: object.etag };
}
async function mutate(env, mailbox, id, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { record, etag } = await getRecord(env, mailbox, id);
    const next = await change(record);
    next.updatedAt = nowISO();
    if (await putRecord(env, next, etag)) return next;
  }
  throw new ApiError(409, 'Email berubah di sesi lain. Muat ulang lalu coba lagi.');
}
async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError(415, 'Gunakan JSON.');
  if (Number(request.headers.get('Content-Length')) > MAX_JSON) throw new ApiError(413, 'Ukuran email terlalu besar.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Body diperlukan.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON) { await reader.cancel(); throw new ApiError(413, 'Ukuran email terlalu besar.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
    return data;
  } catch { throw new ApiError(400, 'JSON tidak valid.'); }
}
function recipients(input, required) {
  if (!Array.isArray(input) || input.length > 10 || input.some((item) => typeof item !== 'string' || !EMAIL.test(item) || item.length > 254)) {
    throw new ApiError(400, 'Alamat penerima tidak valid (maksimal 10).');
  }
  if (required && !input.length) throw new ApiError(400, 'Isi penerima email.');
  return [...new Set(input)];
}
function draftFields(data, mailbox) {
  if (data.from && data.from !== mailbox) throw new ApiError(400, 'Pengirim harus sama dengan mailbox.');
  if (typeof data.subject !== 'string' || data.subject.length > 300 || /[\r\n\x00]/.test(data.subject) ||
      typeof data.text !== 'string' || data.text.length > 200000) throw new ApiError(400, 'Subjek atau isi email tidak valid.');
  for (const key of ['inReplyTo', 'references']) {
    if (data[key] && (typeof data[key] !== 'string' || data[key].length > 2000 || /[\r\n\x00]/.test(data[key]))) throw new ApiError(400, 'Header balasan tidak valid.');
  }
  let billing;
  if (data.billing != null) {
    const value = data.billing;
    if (mailbox !== 'billing@nalaro.digital' || !value || typeof value !== 'object' || Array.isArray(value) ||
        !['invoice', 'receipt'].includes(value.kind) || !['unpaid', 'paid', 'partial', 'cancelled'].includes(value.status) ||
        ![value.amount, value.outstanding].every((amount) => Number.isFinite(amount) && amount >= 0 && amount <= 1e15) ||
        !['number', 'project', 'date'].every((key) => typeof value[key] === 'string' && value[key].length <= 300) || !value.number.trim() ||
        (value.date && (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || Number.isNaN(Date.parse(value.date)))) ||
        (value.relatedInvoice != null && (typeof value.relatedInvoice !== 'string' || value.relatedInvoice.length > 300)) ||
        (value.verificationToken != null && (typeof value.verificationToken !== 'string' || !/^[a-zA-Z0-9_-]{10,80}$/.test(value.verificationToken)))) {
      throw new ApiError(400, 'Informasi billing tidak valid atau pengirim bukan billing@nalaro.digital.');
    }
    billing = { kind: value.kind, number: value.number, project: value.project, amount: value.amount, outstanding: value.outstanding,
      status: value.status, date: value.date, ...(value.relatedInvoice ? { relatedInvoice: value.relatedInvoice } : {}),
      ...(value.verificationToken ? { verificationToken: value.verificationToken } : {}) };
  }
  return { from: mailbox, to: recipients(data.to, false), subject: data.subject, text: data.text, billing,
    inReplyTo: data.inReplyTo || '', references: data.references || '' };
}
function decodeAttachments(input = []) {
  if (!Array.isArray(input) || input.length > 10) throw new ApiError(400, 'Maksimal 10 lampiran.');
  let total = 0;
  return input.map((item) => {
    if (!item || typeof item.filename !== 'string' || typeof item.content !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(item.content) || item.content.length % 4 !== 0 || item.content.length > MAX_JSON) {
      throw new ApiError(400, 'Lampiran tidak valid.');
    }
    const estimated = item.content.length * 0.75 - (item.content.endsWith('==') ? 2 : item.content.endsWith('=') ? 1 : 0);
    if (total + estimated > MAX_ATTACHMENTS) throw new ApiError(413, 'Total lampiran maksimal 8 MB.');
    const bytes = Uint8Array.from(atob(item.content), (c) => c.charCodeAt(0));
    total += bytes.length;
    if (total > MAX_ATTACHMENTS) throw new ApiError(413, 'Total lampiran maksimal 8 MB.');
    return { filename: cleanName(item.filename), contentType: /^[\w.+-]+\/[\w.+-]+$/.test(item.contentType) ? item.contentType : 'application/octet-stream', bytes };
  });
}
async function storeAttachments(env, mailbox, id, decoded, stable = false) {
  const result = [];
  for (const file of decoded) {
    const fileId = stable ? String(result.length).padStart(3, '0') : crypto.randomUUID();
    await env.MAIL_BUCKET.put(attachmentKey(mailbox, id, fileId), file.bytes, { httpMetadata: { contentType: file.contentType } });
    result.push({ id: fileId, filename: file.filename, contentType: file.contentType, size: file.bytes.length,
      ...(file.contentId ? { contentId: String(file.contentId).replace(/[\r\n\x00<>]/g, '').slice(0, 256) } : {}) });
  }
  return result;
}
async function saveDraft(request, env, mailbox, id) {
  const data = await jsonBody(request);
  const fields = draftFields(data, mailbox);
  const decoded = decodeAttachments(data.attachments);
  const current = id ? await getRecord(env, mailbox, id) : null;
  if (current && (current.record.folder !== 'drafts' || !['draft', 'failed'].includes(current.record.status))) throw new ApiError(409, 'Email ini tidak bisa diedit lagi.');
  id ||= newId();
  const attachments = await storeAttachments(env, mailbox, id, decoded);
  const record = { ...(current?.record || {}), ...fields, id, mailbox, folder: 'drafts', status: 'draft', read: true,
    starred: current?.record.starred || false, createdAt: current?.record.createdAt || nowISO(), updatedAt: nowISO(), attachments };
  delete record.resendPayload; delete record.sendStartedAt; delete record.sendError; delete record.html;
  if (!await putRecord(env, record, current?.etag)) {
    await env.MAIL_BUCKET.delete(attachments.map((file) => attachmentKey(mailbox, id, file.id)));
    throw new ApiError(409, 'Draft berubah di sesi lain. Muat ulang.');
  }
  if (current?.record.attachments?.length) await env.MAIL_BUCKET.delete(current.record.attachments.map((file) => attachmentKey(mailbox, id, file.id)));
  return publicRecord(record);
}
function encode64(bytes) {
  let result = ''; for (let offset = 0; offset < bytes.length; offset += 32768) result += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(result);
}
async function sendMessage(env, mailbox, id) {
  if (!env.RESEND_API_KEY) throw new ApiError(503, 'RESEND_API_KEY belum diatur. Draft tetap tersimpan.');
  const { record, etag } = await getRecord(env, mailbox, id);
  if (record.status === 'accepted') return publicRecord(record);
  if (record.folder === 'trash') throw new ApiError(409, 'Pulihkan email sebelum dikirim.');
  if (!['draft', 'failed', 'sending', 'uncertain'].includes(record.status)) throw new ApiError(409, 'Email tidak dapat dikirim.');
  if (record.status === 'sending' && Date.now() - Date.parse(record.updatedAt) < 120000) throw new ApiError(409, 'Pengiriman sedang diproses. Tunggu dua menit sebelum memeriksa ulang.');
  if (record.sendStartedAt && Date.now() - Date.parse(record.sendStartedAt) > 23 * 3600000) throw new ApiError(409, 'Batas aman retry habis. Periksa dashboard Resend sebelum membuat email baru.');
  recipients(record.to, true);
  if (!record.subject.trim() || !record.text.trim()) throw new ApiError(400, 'Isi subjek dan pesan sebelum mengirim.');
  if (!record.resendPayload) {
    const attachments = [];
    for (const file of record.attachments || []) {
      const object = await env.MAIL_BUCKET.get(attachmentKey(mailbox, id, file.id));
      if (!object) throw new ApiError(409, 'Lampiran tidak ditemukan. Simpan ulang draft.');
      attachments.push({ filename: file.filename, content: encode64(new Uint8Array(await object.arrayBuffer())) });
    }
    const name = String(env.MAIL_FROM_NAME || 'Nalaro').replace(/[<>\r\n\x00]/g, '').slice(0, 80);
    const rendered = renderOutgoingEmail(record);
    if (rendered.html) record.html = rendered.html;
    record.resendPayload = { from: `${name} <${mailbox}>`, to: record.to, subject: record.subject, ...rendered, reply_to: mailbox,
      ...(attachments.length ? { attachments } : {}),
      ...(record.inReplyTo ? { headers: { 'In-Reply-To': record.inReplyTo, References: record.references || record.inReplyTo } } : {}) };
  }
  record.status = 'sending'; record.folder = 'sent'; record.sendStartedAt ||= nowISO(); record.updatedAt = nowISO();
  if (!await putRecord(env, record, etag)) throw new ApiError(409, 'Pengiriman sedang diproses di sesi lain.');
  const locked = await getRecord(env, mailbox, id);
  // Persist the exact payload before sending. Retries reuse Resend's 24-hour idempotency window.
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `nalaro-${mailbox}-${id}` },
      body: JSON.stringify(record.resendPayload) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.id) { record.status = 'accepted'; record.resendId = result.id; record.sentAt = nowISO(); delete record.sendError; }
    else {
      record.status = response.status >= 500 || response.status === 409 || response.ok || result.name === 'concurrent_idempotent_requests' ? 'uncertain' : 'failed';
      record.folder = record.status === 'failed' ? 'drafts' : 'sent';
      record.sendError = String(result.message || `Resend HTTP ${response.status}`).slice(0, 300);
    }
  } catch { record.status = 'uncertain'; record.sendError = 'Respons Resend belum diterima. Email mungkin sudah dikirim; periksa atau ulangi dengan ID yang sama.'; }
  record.updatedAt = nowISO();
  if (!await putRecord(env, record, locked.etag)) throw new ApiError(409, 'Status pengiriman berubah. Muat ulang Sent sebelum mencoba lagi.');
  return publicRecord(record);
}
async function listMessages(url, env, mailbox) {
  const folder = url.searchParams.get('folder') || 'inbox';
  if (![...FOLDERS, 'starred'].includes(folder)) throw new ApiError(400, 'Folder tidak valid.');
  const query = (url.searchParams.get('q') || '').slice(0, 160).toLowerCase();
  const page = await env.MAIL_BUCKET.list({ prefix: base(mailbox) + 'messages/', limit: 100, include: ['customMetadata'],
    ...(url.searchParams.get('cursor') ? { cursor: url.searchParams.get('cursor') } : {}) });
  const items = page.objects.flatMap((object) => {
    let item; try { item = JSON.parse(object.customMetadata?.summary || '{}'); } catch { return []; }
    if (!item.id || (folder === 'starred' ? !item.starred || item.folder === 'trash' : item.folder !== folder)) return [];
    return !query || `${item.subject} ${item.from} ${(item.to || []).join(' ')} ${item.preview}`.toLowerCase().includes(query) ? [item] : [];
  });
  return { items, cursor: page.truncated ? page.cursor : null };
}
async function api(request, env, url) {
  requiredEnv(env); await verifyAdmin(request, env);
  if (url.pathname === '/api/mail/config' && request.method === 'GET') return { mailboxes: addresses(env), senderName: env.MAIL_FROM_NAME || 'Nalaro', sendingConfigured: !!env.RESEND_API_KEY, maxAttachmentBytes: MAX_ATTACHMENTS };
  const mailbox = mailboxFor(url, env);
  if (url.pathname === '/api/mail/messages' && request.method === 'GET') return listMessages(url, env, mailbox);
  if (url.pathname === '/api/mail/drafts' && request.method === 'POST') return { message: await saveDraft(request, env, mailbox) };
  const match = url.pathname.match(/^\/api\/mail\/messages\/([^/]+)(?:\/(send|raw|attachments\/[^/]+))?$/);
  if (!match) throw new ApiError(404, 'Endpoint tidak ditemukan.');
  const [, id, action] = match;
  if (request.method === 'POST' && action === 'send') return { message: await sendMessage(env, mailbox, id) };
  if (request.method === 'PUT' && !action) return { message: await saveDraft(request, env, mailbox, id) };
  const { record } = await getRecord(env, mailbox, id);
  if (request.method === 'GET' && !action) return { message: publicRecord(record) };
  if (request.method === 'GET' && action) {
    const file = action.startsWith('attachments/') ? record.attachments?.find((item) => item.id === action.slice(12)) : null;
    if (!file && !(action === 'raw' && record.hasRaw)) throw new ApiError(404, 'Lampiran tidak ditemukan.');
    const object = await env.MAIL_BUCKET.get(file ? attachmentKey(mailbox, id, file.id) : base(mailbox) + `raw/${id}.eml`);
    if (!object) throw new ApiError(404, 'File tidak ditemukan.');
    return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file?.filename || 'email.eml')}` } });
  }
  if (request.method === 'PATCH' && !action) {
    const data = await jsonBody(request);
    if (Object.keys(data).some((key) => !['read', 'starred', 'folder'].includes(key)) ||
        ('read' in data && typeof data.read !== 'boolean') || ('starred' in data && typeof data.starred !== 'boolean')) throw new ApiError(400, 'Perubahan tidak valid.');
    const next = await mutate(env, mailbox, id, (value) => {
      if (['sending', 'uncertain'].includes(value.status)) throw new ApiError(409, 'Selesaikan status pengiriman sebelum mengubah email.');
      if (data.folder) {
        if (data.folder === 'trash' && value.folder !== 'trash') { value.originalFolder = value.folder; value.folder = 'trash'; }
        else if (value.folder === 'trash' && data.folder === value.originalFolder) value.folder = data.folder;
        else throw new ApiError(400, 'Perpindahan folder tidak diizinkan.');
      }
      if ('read' in data) value.read = data.read;
      if ('starred' in data) value.starred = data.starred;
      return value;
    });
    return { message: publicRecord(next) };
  }
  if (request.method === 'DELETE' && !action) {
    if (record.folder !== 'trash') throw new ApiError(409, 'Pindahkan email ke Trash terlebih dahulu.');
    await env.MAIL_BUCKET.delete([recordKey(mailbox, id), base(mailbox) + `raw/${id}.eml`, ...(record.attachments || []).map((file) => attachmentKey(mailbox, id, file.id))]);
    return { deleted: true };
  }
  throw new ApiError(405, 'Metode tidak diizinkan.');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
    // Android Capacitor serves its packaged assets from http://localhost. Firebase ID tokens still protect every mailbox route.
    const nativeOrigin = origin === 'http://localhost';
    if (origin && !allowed.includes(origin) && !nativeOrigin) return Response.json({ error: 'Origin tidak diizinkan.' }, { status: 403, headers });
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      headers.set('Access-Control-Max-Age', '600');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const result = await api(request, env, new URL(request.url));
      if (result instanceof Response) { headers.forEach((value, name) => result.headers.set(name, value)); return result; }
      return Response.json(result, { headers });
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('Mailbox request failed:', error.name);
      return Response.json({ error: error instanceof ApiError ? error.message : 'Layanan mailbox sementara bermasalah. Coba lagi.' }, { status: error instanceof ApiError ? error.status : 500, headers });
    }
  },
  async email(message, env) {
    if (!env.MAIL_BUCKET) throw new Error('MAIL_BUCKET binding is required');
    const mailbox = message.to.toLowerCase();
    if (!addresses(env).includes(mailbox)) { message.setReject('Unknown mailbox'); return; }
    if (message.rawSize > MAX_RAW) { message.setReject('Message exceeds the 10 MB mailbox limit'); return; }
    const raw = await new Response(message.raw).arrayBuffer();
    if (raw.byteLength > MAX_RAW) { message.setReject('Message exceeds the 10 MB mailbox limit'); return; }
    // No Gmail forwarding: the complete original message is retained in private R2.
    const parsed = await PostalMime.parse(raw);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const dedupeKey = base(mailbox) + `received/${digest}`;
    // A stable ID makes duplicate delivery write the same message instead of duplicating it.
    await env.MAIL_BUCKET.put(dedupeKey, JSON.stringify({ id: newId(), complete: false }), { onlyIf: { etagDoesNotMatch: '*' } });
    const receipt = await (await env.MAIL_BUCKET.get(dedupeKey)).json();
    const id = receipt.id;
    if (receipt.complete) return;
    await env.MAIL_BUCKET.put(base(mailbox) + `raw/${id}.eml`, raw, { httpMetadata: { contentType: 'message/rfc822' } });
    const decoded = (parsed.attachments || []).slice(0, 50).map((file) => ({ filename: cleanName(file.filename), contentType: file.mimeType || 'application/octet-stream', contentId: file.contentId || '', bytes: new Uint8Array(file.content) }));
    const attachments = await storeAttachments(env, mailbox, id, decoded, true);
    const safeHeader = (value) => String(value || '').replace(/[\r\n\x00]/g, '').slice(0, 2000);
    const record = { id, mailbox, folder: 'inbox', status: 'received', read: false, starred: false,
      from: parsed.from?.address || message.from, fromName: parsed.from?.name || '', envelopeFrom: message.from,
      to: [mailbox], replyTo: parsed.replyTo?.map((item) => item.address).filter(Boolean) || [],
      subject: String(parsed.subject || '(Tanpa subjek)').slice(0, 300), text: String(parsed.text || '').slice(0, 200000),
      html: String(parsed.html || '').slice(0, 1000000), messageId: safeHeader(parsed.messageId), references: safeHeader(parsed.references),
      createdAt: nowISO(), updatedAt: nowISO(), receivedDate: parsed.date || '', attachments, hasRaw: true };
    await putRecord(env, record);
    await env.MAIL_BUCKET.put(dedupeKey, JSON.stringify({ id, complete: true }));
  },
};
