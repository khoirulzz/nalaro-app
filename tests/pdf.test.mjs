import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, relative, isAbsolute } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

const output = resolve('artifacts/pdf-tests');
function checkVerificationBounds(bytes) {
  const link = bytes.toString('latin1').match(/\/Subtype \/Link \/Rect \[([^\]]+)\].*\/URI \([^\n]*\/verifi\//);
  assert.ok(link, 'PDF needs a clickable public verification QR');
  const [left, top, right, bottom] = link[1].trim().split(/\s+/).map(Number);
  assert.ok(left > 0 && right < 595.3 && Math.min(top, bottom) > 56.6 && Math.max(top, bottom) < 842, 'Complete QR must stay above the footer, including long documents');
}
await mkdir(output, { recursive: true });
await build({ configFile: false, root: resolve('tests'), publicDir: resolve('public'), build: { outDir: resolve('artifacts/pdf-test-site'), emptyOutDir: true, rolldownOptions: { input: resolve('tests/pdf.html') } } });
const root = resolve('artifacts/pdf-test-site');
const server = createServer(async (request, response) => {
  try {
    let path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    const child = relative(root, path);
    if (child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path += '/index.html';
    const data = await readFile(path);
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: JSON.parse(process.env.CHROMIUM_ARGS || '[]') });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pdf.html`);
  await page.waitForFunction(() => window.testAPI);
  console.log('URL, payment snapshot and branded QR checks:', await page.evaluate(() => window.testAPI.checks()));
  for (const kind of ['invoice', 'receipt']) {
    const event = page.waitForEvent('download');
    await page.locator('#' + kind).click();
    const download = await event;
    assert.match(download.suggestedFilename(), /\.pdf$/);
    assert.equal(await download.failure(), null);
    await download.saveAs(resolve(output, kind + '-download.pdf'));
    for (const method of ['Bank Transfer', 'QRIS', 'Cash', 'E-Wallet']) {
      const result = await page.evaluate(({ kind, method }) => window.testAPI.pdf(kind, method), { kind, method });
      const bytes = Buffer.from(result.pdf.split(',')[1], 'base64');
      checkVerificationBounds(bytes);
      await writeFile(resolve(output, kind + '-' + method.replaceAll(' ', '-') + '.pdf'), bytes);
      assert.equal(result.pages, 1, kind + ' / ' + method + ' should remain a one-page document');
      assert.ok(bytes.length < 450000, kind + ' / ' + method + ' PDF should stay compact');
      console.log(kind + ' / ' + method + ': ' + result.pages + ' page(s), ' + bytes.length + ' bytes');
    }
    const long = await page.evaluate((kind) => window.testAPI.pdf(kind, 'QRIS', true), kind);
    assert.equal(long.pages, 1, 'Long content must stay within the compact one-page template');
    checkVerificationBounds(Buffer.from(long.pdf.split(',')[1], 'base64'));
    await writeFile(resolve(output, kind + '-long.pdf'), Buffer.from(long.pdf.split(',')[1], 'base64'));
    console.log(`${kind} / long content: ${long.pages} pages`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: real PDF downloads, one-page compact layout, all payment methods and branded QR decoding.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
