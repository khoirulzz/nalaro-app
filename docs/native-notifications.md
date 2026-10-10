# Nalaro Android: Mail Desk and Native Notifications

## Scope and parity
Web `hulumzz/nalaro-trans` remains the source of truth for invoice/receipt, email templates, pricing and Firestore rules. The Android frontend uses the same mailbox endpoint and same Firebase authentication. Only native routing, local files, mobile layout, opt-in push and separate notification infrastructure differ.

## Cloudflare setup (deployed)
Worker: `nalaro-notify` in the Primary Cloudflare account.
- `NOTIFY_DB` D1: `nalaro-notify`, tables `devices`, `delivered`, `state`.
- `MAIL_BUCKET` R2: existing `nalaro-mailbox` (read-only access in the code).
- `FCM_SERVICE_ACCOUNT_JSON`: Cloudflare secret, never put private key in Git.
- `FIREBASE_PROJECT_ID=nalaro`, `ADMIN_EMAIL=admin@nalaro.digital`.
- `MAILBOX_ADDRESSES`: same five addresses as the Mail Desk.
- Cloudflare Cron `*/1 * * * *` polls R2 received messages and Firebase Firestore `projects` to detect new public orders.

Only events newer than backend activation are sent, with a five-minute scan window, and each successful event is deduplicated in D1. Notification Worker obtains OAuth tokens from the service-account secret for FCM HTTP v1 and Firestore REST (not Firebase Cloud Functions).

**Important:** the service account must have permission to read Firestore `projects` (Cloud Datastore Viewer or equivalent). A service account that only has the FCM sender role will show an error in `state.last_error`; do not give it Owner privileges unnecessarily.

## Android
- Firebase package ID: `com.nalaro.app`. The tracked `android/app/google-services.json` contains **public Android client configuration only**, not a service account or private key.
- After logging in, open **More → Notifikasi native** and allow notifications. Firebase plugin requests FCM token and sends it with the authenticated Firebase ID token to `/register`.
- Subsequent launches renew enrollment if permission was previously granted.
- Opened push routes to Mail Desk for mail, Projects for new orders. Foreground presentation comes from Capacitor's PushNotifications config and Android channel `nalaro_updates`.
- Logging out requests deregistration from the Worker before ending the session.

## Testing and acceptance
1. GitHub Actions: TypeScript, Astro, native smoke, Google Services and APK build.
2. CI: Mailbox CORS preflight for `http://localhost`, Worker health and source guards.
3. On real Android device, sign in, open Mail Desk, list/read/send a disposable email, create draft from Invoice/Receipt with the PDF, and check it opens the editor with the attachment. Confirm sent status in Resend and Mail Desk.
4. Tap More → Notifikasi native; verify count shows at least one registered device.
5. Send an email into one of Nalaro mailboxes and submit one marked dummy public order; notification should appear on Android within approximately one to two minutes, subject to network and battery policy.
6. Check D1 `state.last_poll` and `state.last_error` to audit Worker Cron. A successful build alone does not prove push delivery.

## Security
Mailbox authentication and Firebase Firestore rules stay unchanged. The notification registry accepts only Firebase admin-signed ID tokens. No unrestricted public write permissions were added. Service account credentials stay in encrypted Cloudflare secrets. Email and project records are read by the Cron; the Worker does not modify them. R2 polling needs recent custom metadata on received mail. Keep the production mail Worker separately maintained.

## Operational considerations
The Android APK is currently debug-signed; configure permanent release signing before public distribution. Cron polling scans the most recent 80 email objects per mailbox and 100 Firestore projects per minute. Under extraordinary spikes, earlier items may be missed. If a stronger guaranteed event bus is required in future, add authenticated event submission from Nalaro's existing order/mail Workers rather than opening unrestricted push endpoints.

## v1.1.2 notifications

New `nalaro_alerts_v2` Android channel provides a soft Nalaro-branded two-note custom sound. Devices must open v1.1.2 at least once for the new channel to be created. After opening, use **More → Notifikasi native** and **Uji notifikasi FCM**. Some OEM background/battery limits still affect arrival.

Worker source now deduplicates FCM accepted sends **per device** and R2 queue retries transient failures. A completed GitHub build does not deploy a Cloudflare Worker automatically; deploy `workers/notify/src/worker.js` separately with existing secrets/bindings. One-minute order scanning remains the fallback, so do not promise zero latency.
