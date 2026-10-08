// Compile and evaluate rules through Google's test API without deploying them.
// FIREBASE_TOOLS_ROOT points to an installed firebase-tools package.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { readFile, mkdir, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

(async () => {
  const req = process.env.FIREBASE_TOOLS_ROOT
    ? createRequire(resolve(process.env.FIREBASE_TOOLS_ROOT, 'package.json')) : createRequire(require.resolve('firebase-tools/package.json'));
  const auth = req('./lib/auth');
  const account = auth.getGlobalDefaultAccount();
  assert.ok(account, 'Sign in to Firebase CLI first.');
  const options = { project: 'nalaro', ...account };
  auth.setActiveAccount(options, account);
  await req('./lib/requireAuth').requireAuth(options);
  const { orderRecords, EMPTY_ORDER } = await import('../src/lib/order.ts');
  const id = 'a'.repeat(32), time = '2026-10-07T10:00:00Z';
  const records = orderRecords({ ...EMPTY_ORDER, name: 'Rules Test', picName: 'Test PIC', email: 'test@example.com', whatsapp: '081234567890', projectName: 'Rules Test Project' }, id, time, '2026-10-07');
  const tests = [], names = [];
  function add(name, expectation, collection, method, data, counterpart, user = null, existing = false) {
    names.push(name);
    tests.push({ expectation, request: { auth: user, path: '/databases/(default)/documents/' + collection + '/' + id, method, time, ...(data ? { resource: { data } } : {}) },
      functionMocks: [{ function: 'exists', args: [{ anyValue: {} }], result: { value: existing } },
        { function: 'getAfter', args: [{ anyValue: {} }], result: counterpart ? { value: { data: counterpart } } : { undefined: {} } }] });
  }
  add('public paired client', 'ALLOW', 'clients', 'create', records.client, records.project);
  add('public paired project', 'ALLOW', 'projects', 'create', records.project, records.client);
  add('orphan client', 'DENY', 'clients', 'create', records.client);
  add('orphan project', 'DENY', 'projects', 'create', records.project);
  add('reuse existing client', 'DENY', 'projects', 'create', records.project, records.client, null, true);
  add('reuse existing project', 'DENY', 'clients', 'create', records.client, records.project, null, true);
  for (const [key, value] of Object.entries({ value: 100, status: 'completed', description: 'Public text', clientId: 'existing-id', clientName: 'Different', extra: 'invalid', serviceType: 'invalid', deadline: '2025-01-01', createdAt: '2020-01-01', projectNumber: 'custom-number' })) {
    add('reject project ' + key, 'DENY', 'projects', 'create', { ...records.project, [key]: value }, records.client);
  }
  for (const [key, value] of Object.entries({ name: 'x'.repeat(121), picName: '', email: 'invalid', whatsapp: 'abcdefghi', status: 'inactive', notes: 'Public notes', address: 'x'.repeat(501), projectId: 'existing-id', extra: true })) {
    add('reject client ' + key, 'DENY', 'clients', 'create', { ...records.client, [key]: value }, records.project);
  }
  for (const collection of ['clients', 'projects', 'invoices', 'payments', 'receipts', 'settings']) {
    for (const method of ['get', 'list', 'update', 'delete']) {
      add('public cannot ' + method + ' ' + collection, 'DENY', collection, method, {});
      add('admin can ' + method + ' ' + collection, 'ALLOW', collection, method, {}, undefined, { uid: 'admin', token: { email: 'admin@nalaro.digital' } });
    }
  }
  add('old email denied', 'DENY', 'clients', 'list', {}, undefined, { uid: 'old-admin', token: { email: 'old-admin@nalaro.digital' } });
  add('public verification get', 'ALLOW', 'public_documents', 'get');
  add('public verification list denied', 'DENY', 'public_documents', 'list');
  add('public verification write denied', 'DENY', 'public_documents', 'create', { valid: true });
  add('public invoice creation denied', 'DENY', 'invoices', 'create', { amount: 0 });
  const api = new (req('./lib/apiv2').Client)({ urlPrefix: 'https://firebaserules.googleapis.com', apiVersion: 'v1' });
  const response = await api.post('/projects/nalaro:test', { source: { files: [{ name: 'firestore.rules', content: await readFile('firestore.rules', 'utf8') }] }, testSuite: { testCases: tests } }, { skipLog: { body: true, resBody: true } });
  await mkdir('artifacts/firebase-audit', { recursive: true });
  await writeFile('artifacts/firebase-audit/rules-test-results.json', JSON.stringify({ names, ...response.body }, null, 2));
  assert.ok(!response.body.issues?.some((issue) => issue.severity === 'ERROR'), JSON.stringify(response.body.issues));
  assert.equal(response.body.testResults.length, tests.length);
  const failures = response.body.testResults.flatMap((result, index) => result.state === 'SUCCESS' ? [] : [{ name: names[index], ...result }]);
  assert.deepEqual(failures, []);
  console.log('PASS: compiled Firestore rules and ' + tests.length + ' server-side permission/validation cases; no production writes.');
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
