import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const mobile = await readFile('src/lib/native-notifications.ts','utf8');
const notify = await readFile('workers/notify/src/worker.js','utf8');
const nav = await readFile('src/components/react/mobile/BottomNav.tsx','utf8');
const mail = await readFile('src/components/react/Mailbox.tsx','utf8');
assert.match(mobile,/requestPermissions\(/);
assert.match(mobile,/pushNotificationActionPerformed/);
assert.match(mobile,/getIdToken\(/);
assert.match(notify,/verifyAdmin\(/);
assert.match(notify,/messages:send/);
assert.match(notify,/pollMail\(/);
assert.match(notify,/pollOrders\(/);
assert.doesNotMatch(nav,/🏠|📂|💰|✉️|☰/);
assert.match(nav,/<svg/);
assert.match(mail,/new URLSearchParams\(location.search\)/);
console.log('PASS: native mail routing, SVG bottom navigation and FCM authorization wiring');

const endpoints = [
  'https://mail-api.nalaro.digital/api/mail/config',
  'https://notify-api.nalaro.digital/status',
];
for (const url of endpoints) {
  for (const origin of ['https://localhost','http://localhost']) {
    const res = await fetch(url,{method:'OPTIONS',headers:{
      Origin:origin,'Access-Control-Request-Method':'GET',
      'Access-Control-Request-Headers':'Authorization,Content-Type'
    },signal:AbortSignal.timeout(20000)});
    assert.equal(res.status,204,'CORS preflight '+origin+' to '+url);
    assert.equal(res.headers.get('access-control-allow-origin'),origin,'CORS origin mismatch '+url);
    assert.match(res.headers.get('access-control-allow-headers')||'',/Authorization/i);
    console.log('PASS: '+origin+' -> '+new URL(url).host);
  }
  const noAuth = await fetch(url,{signal:AbortSignal.timeout(20000)});
  assert.equal(noAuth.status,401,'Worker must require Firebase auth: '+url);
}
const health=await fetch('https://notify-api.nalaro.digital/health',{signal:AbortSignal.timeout(20000)});
assert.equal(health.status,200);
console.log('PASS: custom-domain Notify health');
