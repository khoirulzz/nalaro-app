import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/mailbox/dashboard-worker.js';

// In-memory R2 API with conditional writes; tests never contact production services.
class Bucket {
  objects = new Map(); version = 0;
  async put(key, value, options = {}) {
    const existing = this.objects.get(key), condition = options.onlyIf;
    if (condition?.etagDoesNotMatch === '*' && existing) return null;
    if (condition?.etagMatches && existing?.etag !== condition.etagMatches) return null;
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const result = { key, bytes, etag: String(++this.version), customMetadata: options.customMetadata || {} };
    this.objects.set(key, result); return result;
  }
  async get(key) {
    const value = this.objects.get(key); if (!value) return null;
    return { ...value, body: new Response(value.bytes).body, text: async () => new TextDecoder().decode(value.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(value.bytes)), arrayBuffer: async () => value.bytes.slice().buffer };
  }
  async head(key) { return this.objects.get(key) || null; }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key); }
  async list({ prefix, limit = 100, cursor = '0' }) {
    const values = [...this.objects.values()].filter((item) => item.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key));
    const offset = Number(cursor); const page = values.slice(offset, offset + limit);
    return { objects: page, truncated: offset + limit < values.length, cursor: String(offset + limit) };
  }
}
let privateKey, jwk, token, env, resendCalls, resendResult;
const actualFetch = globalThis.fetch;
const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
async function jwt(claims = {}, header = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64({ alg: 'RS256', kid: 'test-key', ...header }) + '.' + b64({ iss: 'https://securetoken.google.com/nalaro', aud: 'nalaro', sub: 'admin-uid', email: 'admin@nalaro.digital', iat: now - 10, auth_time: now - 10, exp: now + 3600, ...claims });
  return body + '.' + Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(body))).toString('base64url');
}
before(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey; jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256' }; token = await jwt();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('googleapis.com')) return Response.json({ keys: [jwk] }, { headers: { 'Cache-Control': 'max-age=3600' } });
    if (String(url) === 'https://api.resend.com/emails') { resendCalls.push(options); return await resendResult(); }
    throw new Error('Unexpected network request: ' + url);
  };
});
after(() => { globalThis.fetch = actualFetch; });
beforeEach(() => {
  env = { MAIL_BUCKET: new Bucket(), FIREBASE_PROJECT_ID: 'nalaro', ADMIN_EMAIL: 'admin@nalaro.digital', MAILBOX_ADDRESSES: 'hello@nalaro.digital,billing@nalaro.digital', ALLOWED_ORIGINS: 'https://order.nalaro.digital', RESEND_API_KEY: 'test-server-secret' };
  resendCalls = []; resendResult = () => Response.json({ id: 'resend-test-id' });
});
const origin = 'https://order.nalaro.digital';
async function api(path, { method = 'GET', body, bearer = token, address = 'hello@nalaro.digital', customOrigin = origin } = {}) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await worker.fetch(new Request('https://mail.test/api/mail' + path + separator + 'mailbox=' + encodeURIComponent(address), {
    method, headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(customOrigin ? { Origin: customOrigin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { response, data: response.headers.get('Content-Type')?.includes('json') ? await response.json() : await response.text() };
}
async function draft(overrides = {}) {
  const { response, data } = await api('/drafts', { method: 'POST', body: { to: ['client@example.com'], subject: 'Hello', text: 'Nalaro message', attachments: [], ...overrides } });
  assert.equal(response.status, 200, JSON.stringify(data)); return data.message;
}
async function receive(raw, to = 'hello@nalaro.digital') {
  let rejected;
  await worker.email({ to, from: 'sender@example.com', rawSize: Buffer.byteLength(raw), raw: new Response(raw).body, setReject: (reason) => { rejected = reason; } }, env);
  return rejected;
}
const mime = ['From: "Client" <sender@example.com>', 'To: hello@nalaro.digital', 'Reply-To: replies@example.com', 'Subject: =?UTF-8?B?SW52b2ljZSBmb3IgTmFsYXJv?=', 'Message-ID: <mail-1@example.com>', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="test-boundary"', '', '--test-boundary', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', 'Hello Nalaro! =E2=9C=93', '--test-boundary', 'Content-Type: application/pdf; name="invoice.pdf"', 'Content-Disposition: attachment; filename="invoice.pdf"', 'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-test-file').toString('base64'), '--test-boundary--', ''].join('\r\n');

test('CORS blocks unknown origin, allows exact origin and authenticated preflight', async () => {
  assert.equal((await api('/config', { customOrigin: 'https://evil.example' })).response.status, 403);
  const allowed = await api('/config'); assert.equal(allowed.response.headers.get('Access-Control-Allow-Origin'), origin);
  const preflight = await api('/config', { method: 'OPTIONS', bearer: null }); assert.equal(preflight.response.status, 204);
  assert.equal(allowed.response.headers.get('Cache-Control'), 'no-store'); assert.equal(allowed.data.mailboxes.length, 2);
  assert.ok(!JSON.stringify(allowed.data).includes(env.RESEND_API_KEY));
});
test('missing configuration fails closed', async () => { delete env.MAIL_BUCKET; assert.equal((await api('/config')).response.status, 503); });
test('unauthenticated requests are denied', async () => { assert.equal((await api('/config', { bearer: null })).response.status, 401); });
for (const [name, claims, header, status] of [
  ['expired', { exp: 1 }, {}, 401], ['wrong audience', { aud: 'other' }, {}, 401], ['wrong issuer', { iss: 'https://evil.example' }, {}, 401],
  ['invalid algorithm', {}, { alg: 'HS256' }, 401], ['wrong admin', { email: 'other@nalaro.digital' }, {}, 403], ['future authentication', { auth_time: 9999999999 }, {}, 401],
]) test('JWT rejects ' + name, async () => { assert.equal((await api('/config', { bearer: await jwt(claims, header) })).response.status, status); });
test('tampered signature is rejected', async () => { assert.equal((await api('/config', { bearer: token.slice(0, -20) + 'x'.repeat(20) })).response.status, 401); });
test('optional admin UID is enforced', async () => { env.ADMIN_UID = 'other-uid'; assert.equal((await api('/config')).response.status, 403); });
test('mailbox isolation and key traversal are rejected', async () => {
  assert.equal((await api('/messages', { address: 'outsider@example.com' })).response.status, 403);
  const message = await draft(); assert.equal((await api('/messages/' + message.id, { address: 'billing@nalaro.digital' })).response.status, 404);
  assert.equal((await api('/messages/not-a-valid-id')).response.status, 400);
});
test('draft attachment is private, downloadable and replaced cleanly', async () => {
  const message = await draft({ attachments: [{ filename: '../invoice.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-data').toString('base64') }] });
  assert.equal((await api('/messages/' + message.id + '/attachments/' + message.attachments[0].id)).data, '%PDF-data');
  const updated = await api('/messages/' + message.id, { method: 'PUT', body: { to: [], subject: '', text: '', attachments: [] } });
  assert.equal(updated.data.message.attachments.length, 0);
  assert.equal((await api('/messages/' + message.id + '/attachments/' + message.attachments[0].id)).response.status, 404);
});
test('invalid fields and oversized attachments never send', async () => {
  for (const override of [{ to: ['bad'] }, { subject: 'header\r\ninjection' }, { from: 'spoof@example.com' }, { attachments: [{ filename: 'a', content: '*invalid*' }] }, { references: '<id>\r\nBcc:evil@example.com' }]) {
    assert.equal((await api('/drafts', { method: 'POST', body: { to: [], subject: '', text: '', ...override } })).response.status, 400);
  }
  assert.equal((await api('/drafts', { method: 'POST', body: { to: [], subject: '', text: '', attachments: [{ filename: 'large', content: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64') }] } })).response.status, 413);
  assert.equal(resendCalls.length, 0);
});
test('sending requires recipient, text, subject and server key', async () => {
  const message = await draft({ to: [] }); assert.equal((await api('/messages/' + message.id + '/send', { method: 'POST' })).response.status, 400);
  const complete = await draft(); delete env.RESEND_API_KEY; assert.equal((await api('/messages/' + complete.id + '/send', { method: 'POST' })).response.status, 503);
});
test('Resend sends from allowed mailbox with attachment and threaded reply, stores accepted once', async () => {
  const message = await draft({ inReplyTo: '<mail-1@example.com>', references: '<earlier@example.com> <mail-1@example.com>', attachments: [{ filename: 'invoice.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-test').toString('base64') }] });
  const sent = await api('/messages/' + message.id + '/send', { method: 'POST' }); assert.equal(sent.data.message.status, 'accepted');
  const payload = JSON.parse(resendCalls[0].body); assert.equal(payload.from, 'Nalaro <hello@nalaro.digital>'); assert.equal(payload.reply_to, 'hello@nalaro.digital');
  assert.equal(payload.headers['In-Reply-To'], '<mail-1@example.com>'); assert.equal(Buffer.from(payload.attachments[0].content, 'base64').toString(), '%PDF-test');
  assert.ok(!('resendPayload' in sent.data.message)); assert.equal((await api('/messages?folder=sent')).data.items.length, 1);
  await api('/messages/' + message.id + '/send', { method: 'POST' }); assert.equal(resendCalls.length, 1);
  assert.equal((await api('/messages/' + message.id, { method: 'PUT', body: { to: [], text: '', subject: '' } })).response.status, 409);
});
test('network ambiguity retries the identical payload and idempotency key', async () => {
  const message = await draft(); resendResult = () => { throw new Error('timeout'); };
  assert.equal((await api('/messages/' + message.id + '/send', { method: 'POST' })).data.message.status, 'uncertain');
  assert.equal((await api('/messages/' + message.id, { method: 'PATCH', body: { folder: 'trash' } })).response.status, 409);
  resendResult = () => Response.json({ id: 'retry-success' }); const retry = await api('/messages/' + message.id + '/send', { method: 'POST' });
  assert.equal(retry.data.message.status, 'accepted'); assert.equal(resendCalls[0].body, resendCalls[1].body); assert.equal(resendCalls[0].headers['Idempotency-Key'], resendCalls[1].headers['Idempotency-Key']);
});
test('branding payload and billing metadata survive draft edit and sending', async () => {
  const billing = { kind: 'invoice', number: 'NAL/INV/2026/123456', project: 'Website desa', amount: 1000000, outstanding: 1000000, status: 'unpaid', date: '2026-10-30', verificationToken: 'a'.repeat(20) };
  const saved = await api('/drafts', { method: 'POST', address: 'billing@nalaro.digital', body: { to: ['client@example.com'], subject: 'Invoice', text: 'Hello client', billing } });
  assert.equal(saved.response.status, 200); assert.deepEqual(saved.data.message.billing, billing);
  const sent = await api('/messages/' + saved.data.message.id + '/send', { method: 'POST', address: 'billing@nalaro.digital' });
  const payload = JSON.parse(resendCalls[0].body);
  assert.ok(payload.html.includes('UNPAID')); assert.ok(payload.html.includes('/verifi/' + billing.verificationToken));
  assert.ok(payload.text.includes('Invoice total:')); assert.equal(sent.data.message.html, payload.html);
});
test('personal mailbox sends exact text without branding or HTML', async () => {
  for (const address of ['admin@nalaro.digital', 'khoirululum@nalaro.digital']) {
    env.MAILBOX_ADDRESSES += ',' + address;
    const saved = await api('/drafts', { method: 'POST', address, body: { to: ['client@example.com'], subject: 'Personal', text: 'Exact personal text' } });
    await api('/messages/' + saved.data.message.id + '/send', { method: 'POST', address });
    const payload = JSON.parse(resendCalls.at(-1).body);
    assert.equal(payload.text, 'Exact personal text'); assert.equal(payload.html, undefined);
  }
});
test('billing cannot be spoofed through another mailbox or malformed metadata', async () => {
  const billing = { kind: 'invoice', number: 'INV', project: '', amount: 1, outstanding: 1, status: 'unpaid', date: '' };
  assert.equal((await api('/drafts', { method: 'POST', body: { to: [], subject: '', text: '', billing } })).response.status, 400);
  for (const override of [{ amount: -1 }, { date: 'bad' }, { verificationToken: 'javascript:alert(1)' }, { kind: 'unknown' }]) {
    assert.equal((await api('/drafts', { method: 'POST', address: 'billing@nalaro.digital', body: { to: [], subject: '', text: '', billing: { ...billing, ...override } } })).response.status, 400);
  }
});
test('concurrent sends take one conditional lock', async () => {
  const message = await draft(); let release; resendResult = () => new Promise((resolve) => { release = resolve; });
  const first = api('/messages/' + message.id + '/send', { method: 'POST' });
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  const second = await api('/messages/' + message.id + '/send', { method: 'POST' }); assert.equal(second.response.status, 409);
  release(Response.json({ id: 'accepted-concurrent' })); await first; assert.equal(resendCalls.length, 1);
});
test('provider rejection stays in drafts with an actionable error', async () => {
  const message = await draft(); resendResult = () => Response.json({ message: 'Domain is not verified' }, { status: 422 });
  const result = await api('/messages/' + message.id + '/send', { method: 'POST' }); assert.equal(result.data.message.status, 'failed'); assert.equal(result.data.message.folder, 'drafts'); assert.match(result.data.message.sendError, /verified/);
});
test('retry beyond idempotency safety window is blocked', async () => {
  const message = await draft(); resendResult = () => { throw new Error('network'); }; await api('/messages/' + message.id + '/send', { method: 'POST' });
  const key = [...env.MAIL_BUCKET.objects.keys()].find((key) => key.endsWith(message.id + '.json'));
  const object = await env.MAIL_BUCKET.get(key); const value = await object.json(); value.sendStartedAt = '2000-01-01T00:00:00Z'; await env.MAIL_BUCKET.put(key, JSON.stringify(value));
  assert.equal((await api('/messages/' + message.id + '/send', { method: 'POST' })).response.status, 409); assert.equal(resendCalls.length, 1);
});
test('MIME receive decodes UTF-8, Reply-To, attachment and retains original EML', async () => {
  await receive(mime); const list = (await api('/messages')).data.items; assert.equal(list.length, 1); assert.equal(list[0].read, false);
  const message = (await api('/messages/' + list[0].id)).data.message; assert.equal(message.subject, 'Invoice for Nalaro'); assert.match(message.text, /✓/); assert.deepEqual(message.replyTo, ['replies@example.com']);
  assert.equal((await api('/messages/' + message.id + '/attachments/' + message.attachments[0].id)).data, '%PDF-test-file'); assert.equal((await api('/messages/' + message.id + '/raw')).data, mime);
  await receive(mime); assert.equal((await api('/messages')).data.items.length, 1);
});
test('unknown inbound mailbox and oversized message are rejected', async () => {
  assert.equal(await receive(mime, 'unknown@nalaro.digital'), 'Unknown mailbox');
  let rejected; await worker.email({ to: 'hello@nalaro.digital', rawSize: 11 * 1024 * 1024, setReject: (reason) => { rejected = reason; } }, env); assert.match(rejected, /limit/);
});
test('read/star, restricted trash/restore and permanent deletion remove message/files', async () => {
  await receive(mime); const message = (await api('/messages')).data.items[0];
  assert.equal((await api('/messages/' + message.id, { method: 'PATCH', body: { read: true, starred: true } })).data.message.read, true);
  assert.equal((await api('/messages?folder=starred')).data.items.length, 1);
  assert.equal((await api('/messages/' + message.id, { method: 'PATCH', body: { folder: 'sent' } })).response.status, 400);
  assert.equal((await api('/messages/' + message.id, { method: 'DELETE' })).response.status, 409);
  await api('/messages/' + message.id, { method: 'PATCH', body: { folder: 'trash' } }); assert.equal((await api('/messages?folder=trash')).data.items.length, 1);
  await api('/messages/' + message.id, { method: 'PATCH', body: { folder: 'inbox' } });
  await api('/messages/' + message.id, { method: 'PATCH', body: { folder: 'trash' } });
  assert.equal((await api('/messages/' + message.id, { method: 'DELETE' })).data.deleted, true); assert.equal((await api('/messages/' + message.id)).response.status, 404);
  assert.equal([...env.MAIL_BUCKET.objects.keys()].filter((key) => /messages|files|raw/.test(key)).length, 0);
  await receive(mime); assert.equal((await api('/messages')).data.items.length, 0, 'Duplicate delivery must not resurrect deleted mail');
});
test('pagination keeps cursor even if filtered page has no matching messages', async () => {
  for (let index = 0; index < 105; index++) await draft({ subject: 'Draft ' + index });
  const first = await api('/messages?folder=inbox'); assert.equal(first.data.items.length, 0); assert.ok(first.data.cursor);
  const second = await api('/messages?folder=drafts&cursor=' + first.data.cursor); assert.equal(second.data.items.length, 5); assert.equal(second.data.cursor, null);
  const search = await api('/messages?folder=drafts&q=not-found'); assert.equal(search.data.items.length, 0); assert.ok(search.data.cursor);
});

test('MIME inline images preserve Content-ID and remain private attachments', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const inline = [
    'From: Sender <sender@example.com>',
    'To: hello@nalaro.digital',
    'Subject: Inline image from platform',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="related-test"',
    '', '--related-test',
    'Content-Type: text/html; charset=utf-8',
    '', '<html><body><img src="cid:logo.platform@example.com" alt="Logo"></body></html>',
    '--related-test',
    'Content-Type: image/png',
    'Content-ID: <logo.platform@example.com>',
    'Content-Disposition: inline; filename="logo.png"',
    'Content-Transfer-Encoding: base64',
    '', png.toString('base64'),
    '--related-test--', ''
  ].join('\r\n');
  await receive(inline);
  const summary = (await api('/messages')).data.items[0];
  const message = (await api('/messages/' + summary.id)).data.message;
  const image = message.attachments[0];
  assert.equal(image.contentId, 'logo.platform@example.com');
  assert.equal(image.contentType, 'image/png');
  assert.match(message.html, /cid:logo.platform@example.com/);
  const file = await api('/messages/' + message.id + '/attachments/' + image.id);
  assert.equal(file.response.status, 200);
  assert.deepEqual(Buffer.from(file.data, 'utf8').subarray(0, 4), png.subarray(0, 4));
  const unauth = await api('/messages/' + message.id + '/attachments/' + image.id, { bearer: null });
  assert.equal(unauth.response.status, 401);
});
