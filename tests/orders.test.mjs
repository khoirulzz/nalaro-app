import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { orderRecords, localDate, EMPTY_ORDER } from '../src/lib/order.ts';
import { createServer } from 'node:http';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { build } from 'vite';
import { chromium } from 'playwright';

const env = await initializeTestEnvironment({ projectId: 'demo-nalaro-orders', firestore: { host: '127.0.0.1', port: 8085, rules: await readFile('firestore.rules', 'utf8') } });
const publicDb = env.unauthenticatedContext().firestore();
const adminDb = env.authenticatedContext('admin', { email: 'admin@nalaro.digital' }).firestore();
const oldAdminDb = env.authenticatedContext('old', { email: 'old-admin@nalaro.digital' }).firestore();
const input = { ...EMPTY_ORDER, name: 'Klien Contoh', picName: 'PIC Contoh', email: 'client@example.com', whatsapp: '081234567890', projectName: 'Website Contoh' };
let counter = 0;
function order() { const id = (++counter).toString(16).padStart(32, 'a'); return { id, ...orderRecords(input, id, serverTimestamp(), localDate()) }; }
function submit(db, record) { const batch = writeBatch(db); batch.set(doc(db, 'clients', record.id), record.client); batch.set(doc(db, 'projects', record.id), record.project); return batch.commit(); }
try {
  const valid = order();
  await assertSucceeds(submit(publicDb, valid));
  const savedClient = await assertSucceeds(getDoc(doc(adminDb, 'clients', valid.id)));
  const savedProject = await assertSucceeds(getDoc(doc(adminDb, 'projects', valid.id)));
  assert.equal(savedProject.data().clientId, savedClient.id);
  assert.equal(savedProject.data().value, 0);
  await assertSucceeds(updateDoc(doc(adminDb, 'clients', valid.id), { name: 'Klien Disesuaikan' }));
  await assertSucceeds(updateDoc(doc(adminDb, 'projects', valid.id), { value: 2500000, description: 'Diisi admin', status: 'in_progress' }));
  await assertFails(getDoc(doc(publicDb, 'clients', valid.id)));
  await assertFails(getDocs(collection(publicDb, 'projects')));
  await assertFails(updateDoc(doc(publicDb, 'projects', valid.id), { value: 100 }));
  await assertFails(deleteDoc(doc(publicDb, 'clients', valid.id)));
  await assertFails(getDocs(collection(oldAdminDb, 'clients')));
  const loneClient = order(); await assertFails(setDoc(doc(publicDb, 'clients', loneClient.id), loneClient.client));
  const loneProject = order(); await assertFails(setDoc(doc(publicDb, 'projects', loneProject.id), loneProject.project));
  for (const mutate of [
    (r) => { r.project.value = 500; },
    (r) => { r.project.description = 'Disisipkan publik'; },
    (r) => { r.project.status = 'completed'; },
    (r) => { r.project.clientId = valid.id; },
    (r) => { r.project.extra = 'field ilegal'; },
    (r) => { r.client.name = 'x'.repeat(121); },
    (r) => { r.client.email = 'invalid'; },
    (r) => { r.client.whatsapp = 'abcdefghi'; },
    (r) => { r.client.createdAt = new Date(0); },
    (r) => { r.project.clientName = 'Different client'; },
  ]) { const bad = order(); mutate(bad); await assertFails(submit(publicDb, bad)); assert.equal((await getDoc(doc(adminDb, 'clients', bad.id))).exists(), false); }
  await assertSucceeds(setDoc(doc(adminDb, 'public_documents', 'known-token'), { valid: true }));
  await assertSucceeds(getDoc(doc(publicDb, 'public_documents', 'known-token')));
  await assertFails(getDocs(collection(publicDb, 'public_documents')));
  await assertFails(setDoc(doc(publicDb, 'invoices', 'bad'), { amount: 0 }));
  assert.throws(() => orderRecords({ ...input, name: '  ' }, valid.id, new Date(), localDate()));
  await build({ configFile: false, root: resolve('tests'), publicDir: resolve('public'), define: { 'import.meta.env.PUBLIC_FIREBASE_PROJECT_ID': JSON.stringify('demo-nalaro-orders') }, build: { outDir: resolve('artifacts/order-test-site'), emptyOutDir: true, rolldownOptions: { input: resolve('tests/order.html') } } });
  const root = resolve('artifacts/order-test-site');
  const server = createServer(async (req, res) => {
    try {
      let path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
      const child = relative(root, path); if (child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid path');
      if ((await stat(path)).isDirectory()) path += '/index.html';
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/order.html`);
    await page.getByLabel('Nama klien').fill('Klien dari Browser');
    await page.getByLabel('Nama penanggung jawab').fill('PIC Browser');
    await page.getByLabel('Email *', { exact: true }).fill('browser@example.com');
    await page.getByLabel('WhatsApp *').fill('+62 (812) 345-6789');
    await page.getByLabel('Nama proyek *').fill('Order Tanpa Login');
    await page.getByRole('button', { name: 'Kirim order' }).click();
    await page.getByRole('heading', { name: /Terima kasih/ }).waitFor();
    const clients = (await getDocs(collection(adminDb, 'clients'))).docs.filter((d) => d.data().name === 'Klien dari Browser');
    assert.equal(clients.length, 1);
    const client = clients[0];
    const project = await getDoc(doc(adminDb, 'projects', client.id));
    assert.equal(project.data().name, 'Order Tanpa Login');
    assert.equal(project.data().clientId, client.id);
    assert.equal(project.data().value, 0);
    assert.deepEqual(errors, []);
    await page.getByRole('button', { name: 'Kirim proyek lain' }).click();
    assert.equal(await page.getByLabel('Nama klien').inputValue(), '');
    console.log('PASS: real browser form writes one linked client/project without login and clears only after confirmation.');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
  console.log('PASS: anonymous atomic orders, private reads, validation, admin edits, changed admin email, public verification.');
} finally { await env.cleanup(); }
