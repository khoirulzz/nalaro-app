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
const checks = [
  {url:'https://nalaro-mailbox.uniquefactuhl.workers.dev/api/mail/config',opts:{method:'OPTIONS',headers:{Origin:'http://localhost','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}} ,expected:204,allow:'http://localhost'},
  {url:'https://nalaro-notify.uniquefactuhl.workers.dev/health',opts:{method:'GET'},expected:200},
];
for(const test of checks){
  const response=await fetch(test.url,{...test.opts,signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,test.expected,'Unexpected response from '+test.url);
  if(test.allow)assert.equal(response.headers.get('access-control-allow-origin'),test.allow);
  console.log('PASS: remote endpoint response '+response.status+' ('+new URL(test.url).host+')');
}
