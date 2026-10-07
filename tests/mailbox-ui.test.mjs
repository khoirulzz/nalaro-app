import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, extname, relative } from 'node:path';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
const root = resolve('artifacts/mailbox-test-site');
await mkdir('artifacts/mailbox-tests', { recursive: true });
await build({ configFile: false, plugins: [tailwindcss()], root: resolve('tests'), publicDir: false, build: { outDir: root, emptyOutDir: true, rolldownOptions: { input: resolve('tests/mailbox.html') } } });
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const path = resolve(root, '.' + pathname); if (relative(root, path).startsWith('..')) throw new Error();
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage({ acceptDownloads: true }); const errors = [], trackerRequests = [];
  await page.route('https://order.nalaro.digital/brand/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (!['nalaro.png', 'nalaro-email-banner.jpg'].includes(name)) return route.abort();
    await route.fulfill({ body: await readFile(resolve('public/brand', name)), contentType: name.endsWith('.jpg') ? 'image/jpeg' : 'image/png' });
  });
  page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => { if (request.url().includes('tracker.invalid')) trackerRequests.push(request.url()); });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(origin + '/mailbox.html');
    await page.getByRole('button', { name: /Penawaran website/ }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mailbox overflow at ' + width);
    await page.screenshot({ path: `artifacts/mailbox-tests/mailbox-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Penawaran website/ }).click(); await page.getByRole('heading', { name: /Penawaran website/ }).waitFor();
    await page.getByRole('button', { name: 'Tampilan HTML', exact: true }).click();
    await page.frameLocator('iframe').getByRole('heading', { name: 'Proposal Nalaro' }).waitFor();
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.deepEqual(trackerRequests, []); assert.equal(await page.locator('iframe').getAttribute('sandbox'), '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Reader overflow at ' + width);
    await page.screenshot({ path: `artifacts/mailbox-tests/reader-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Balas email' }).click();
    await page.getByRole('dialog').waitFor();
    const dialogBounds = await page.getByRole('dialog').boundingBox(); assert.ok(dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= 1001, 'Dialog stays within viewport');
    assert.equal(await page.getByLabel('Penerima email').inputValue(), 'reply@example.com');
    assert.match(await page.getByLabel('Subjek email').inputValue(), /^Re:/);
    await page.getByRole('button', { name: 'Pratinjau email' }).click();
    const preview = page.frameLocator('.mail-template-preview');
    await preview.getByRole('heading', { name: /^Re:/ }).waitFor();
    assert.equal(await preview.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Template preview overflow at ' + width);
    assert.equal(await page.locator('.mail-template-preview').getAttribute('sandbox'), '');
    await page.screenshot({ path: `artifacts/mailbox-tests/template-preview-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Tutup pratinjau' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Composer overflow at ' + width);
    await page.screenshot({ path: `artifacts/mailbox-tests/compose-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Tutup editor email' }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + '/mailbox.html');
  await page.getByRole('button', { name: /Penawaran website/ }).click(); await page.getByRole('button', { name: '☆ Star', exact: true }).click();
  await page.getByRole('button', { name: 'Starred', exact: true }).click(); await page.getByRole('button', { name: /Penawaran website/ }).waitFor();
  await page.getByRole('button', { name: /Penawaran website/ }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: /Kebutuhan-proyek/ }).click(); assert.match((await downloadEvent).suggestedFilename(), /\.pdf$/);
  await page.getByRole('button', { name: 'Trash', exact: true }).last().click(); await page.getByRole('button', { name: 'Trash', exact: true }).first().click();
  await page.getByRole('button', { name: /Penawaran website/ }).click(); await page.getByRole('button', { name: 'Pulihkan' }).click();
  await page.getByRole('button', { name: 'Tulis email' }).click();
  await page.getByLabel('Penerima email').fill('newclient@example.com'); await page.getByLabel('Subjek email').fill('Draft untuk klien'); await page.getByLabel('Isi pesan').fill('Isi penawaran Nalaro.');
  await page.getByLabel('Tambah lampiran').setInputFiles({ name: 'proposal.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.getByRole('button', { name: 'Simpan draft' }).click(); await page.getByRole('status').filter({ hasText: 'Draft tersimpan' }).waitFor();
  await page.getByRole('button', { name: /Draft untuk klien/ }).click(); await page.getByRole('button', { name: 'Lanjutkan draft' }).click();
  assert.equal(await page.getByLabel('Subjek email').inputValue(), 'Draft untuk klien');
  await page.getByRole('button', { name: 'Kirim email' }).click(); await page.getByRole('status').filter({ hasText: 'diterima Resend' }).waitFor();
  await page.getByRole('button', { name: 'Sent', exact: true }).click(); await page.getByRole('button', { name: /Draft untuk klien/ }).waitFor();
  await page.getByLabel('Pilih mailbox').selectOption('billing@nalaro.digital'); await page.getByText('Belum ada email di bagian ini.').waitFor();
  await page.goto(origin + '/mailbox.html?mailbox=hello%40nalaro.digital&draft=' + '8999999999998-' + 'b'.repeat(32));
  await page.getByRole('dialog').waitFor(); assert.equal(await page.getByLabel('Subjek email').inputValue(), 'Draft penawaran');
  await page.goto(origin + '/mailbox.html?unconfigured'); await page.getByRole('heading', { name: 'Mailbox belum terhubung' }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Tulis email' }).isDisabled(), true);
  assert.deepEqual(errors, []); console.log('PASS: 320/390/768/1024/1440px mailbox/reader/composer, HTML isolation, blocked trackers, reply, attachments, starred, trash/restore, save/reopen draft, send, mailbox switch, unconfigured state. No real email sent.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
