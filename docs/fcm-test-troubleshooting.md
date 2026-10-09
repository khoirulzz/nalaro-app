# FCM self-test outcome fix

One Android device was registered in D1; Cloudflare `delivered` recorded accepted `mail` and `test` messages. Therefore FCM credentials **have already successfully submitted notifications**. Delivery to the phone's notification tray remains unverified.

The older `/test` endpoint used an event key based on `Math.floor(Date.now()/60000)`. Repeat taps within one minute returned zero sends and `ok:false` even after an earlier accepted send.

Fix: test event IDs now use `crypto.randomUUID()`; the last successful test is subject to a 15-second cooldown reported as `ok:true, status:'cooldown'`. Actual FCM errors return safe HTTP/status/message details without exposing device tokens. The backend records `state.last_push_error` in D1; the Android UI displays the specific error.

If a test is accepted but no tray notification appears: check Android app notification permission, the `nalaro_updates` notification channel, device battery/background restrictions, and test with the app in background. `messages:send` accepted does not guarantee visible delivery.

No changes were made to web NalaroTrans or public Firestore rules.
