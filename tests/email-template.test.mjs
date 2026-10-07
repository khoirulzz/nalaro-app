import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOutgoingEmail, EMAIL_BANNER_URL } from '../src/lib/email-template.js';

const message = { from: 'hello@nalaro.digital', subject: 'Tentang proyek Anda', text: 'Halo Indri,\n\nBerikut penawaran kami.\nTerima kasih.', year: 2026 };
const billing = { kind: 'invoice', number: 'NAL/INV/2026/123456', project: 'Website desa', amount: 2500000, outstanding: 1250000, status: 'partial', date: '2026-10-30', verificationToken: 'a'.repeat(20) };
test('brand applies only to hello, business and billing, including replies', () => {
  for (const from of ['hello', 'business', 'billing']) {
    const result = renderOutgoingEmail({ ...message, from: from + '@nalaro.digital', inReplyTo: '<reply@example.com>' });
    assert.ok(result.html.includes(EMAIL_BANNER_URL));
    assert.ok(result.text.includes('https://www.nalaro.digital'));
    assert.match(result.html, /role="presentation"/);
    assert.equal((result.html.match(/<h1\b/g) || []).length, 1);
  }
  for (const from of ['admin@nalaro.digital', 'khoirululum@nalaro.digital', 'hello@example.com', 'constructor']) {
    assert.deepEqual(renderOutgoingEmail({ ...message, from }), { text: message.text });
  }
});
test('dynamic text is escaped and line breaks retained', () => {
  const result = renderOutgoingEmail({ ...message, subject: '<img src=x onerror=alert(1)>', text: '<script>alert(1)</script>\nsecond line\n\nA & B' });
  assert.ok(!result.html.includes('<script>')); assert.ok(!result.html.includes('<img src=x'));
  assert.ok(result.html.includes('&lt;script&gt;')); assert.ok(result.html.includes('<br>second line')); assert.ok(result.html.includes('A &amp; B'));
});
test('billing preserves amount, balance, date, status and public verification link', () => {
  const result = renderOutgoingEmail({ ...message, from: 'billing@nalaro.digital', billing });
  for (const value of ['PARTIALLY PAID', billing.number, 'Rp', '2.500.000', '1.250.000', '30 Oct 2026', '/verifi/' + billing.verificationToken]) assert.ok(result.html.includes(value), value);
  assert.match(result.text, /Amount due: Rp/); assert.ok(result.text.includes('/verifi/' + billing.verificationToken));
  const receipt = renderOutgoingEmail({ ...message, from: 'billing@nalaro.digital', billing: { ...billing, kind: 'receipt', relatedInvoice: billing.number } });
  assert.ok(receipt.html.includes('PAYMENT RECEIPT')); assert.ok(receipt.html.includes('#176339')); assert.ok(!receipt.html.includes('Amount due'));
  const generic = renderOutgoingEmail({ ...message, from: 'hello@nalaro.digital', billing });
  assert.ok(!generic.html.includes(billing.number));
});
test('no untrusted URL can become an action link', () => {
  const result = renderOutgoingEmail({ ...message, from: 'billing@nalaro.digital', billing: { ...billing, verificationToken: 'x" onclick="alert(1)' } });
  assert.ok(!result.html.includes('onclick')); assert.ok(!result.html.includes('Verify invoice'));
});
