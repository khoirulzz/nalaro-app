import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:4322';
await mkdir('artifacts/ui-tests', { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/verifi/regression-nonexistent-token', '/verif/regression-nonexistent-token/', '/verifi/?token=regression-nonexistent-token']) {
    const response = await page.goto(origin + path);
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: /Dokumen tidak dapat/ }).waitFor();
    assert.ok(!page.url().includes('/login'), 'Public verification redirected to login');
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const response = await page.goto(origin + '/form/order');
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: /Proyek baru/ }).waitFor();
    assert.equal(await page.locator('form input:not([name="personal_website"]), form textarea, form select').count(), 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Form overflows at ' + width);
    assert.equal(await page.getByLabel('WhatsApp *').getAttribute('type'), 'tel');
    await page.screenshot({ path: `artifacts/ui-tests/form-${width}.png`, fullPage: true });
  }
  await page.goto(origin + '/form/client-project');
  await page.getByRole('heading', { name: /Proyek baru/ }).waitFor();
  await page.getByLabel('Nama klien').fill('Klien Pengujian');
  await page.getByLabel('Nama penanggung jawab').fill('PIC Pengujian');
  await page.getByLabel('Email *', { exact: true }).fill('test@example.com');
  await page.getByLabel('WhatsApp *').fill('+62 (812) 345-6789');
  await page.getByLabel('Nama proyek *').fill('Proyek Pengujian');
  assert.equal(await page.locator('form').evaluate((form) => form.checkValidity()), true);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Kirim order' }).click();
  await page.getByRole('alert').filter({ hasText: 'offline' }).waitFor();
  assert.equal(await page.getByLabel('Nama proyek *').inputValue(), 'Proyek Pengujian');
  await page.context().setOffline(false);
  const mailResponse = await page.request.get(origin + '/admin/email');
  assert.equal(mailResponse.status(), 200);
  assert.match(await mailResponse.text(), /AdminApp|EntryApp/, 'Email deep link must load the application shell');
  await page.goto(origin + '/admin/email');
  await page.waitForURL(/\/login\/?$/);
  await page.goto(origin + '/admin/projects');
  // Pages canonicalizes the login directory with a trailing slash.
  await page.waitForURL(/\/login\/?$/);
  assert.equal(await page.getByLabel('Email admin').inputValue(), 'admin@nalaro.digital');
  assert.deepEqual(errors, []);
  console.log('PASS: Pages public deep links, legacy verification, 320/390/1440px forms, contact validation, offline feedback, admin guard and email.');
} finally { await browser.close(); }
