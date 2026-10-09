# Nalaro Mobile Release Notes

The GitHub Actions mobile workflow builds Astro with `PUBLIC_NATIVE_APP=true`, producing a native-only root and Firebase session bootstrap. It is isolated from the browser/public root build.

Android internal routes use a HashRouter; the WebView should never fully reload to `/login` or `/admin`.

**Important:** Current Gradle `assembleRelease` output is signed with the Android debug key. GitHub Actions currently labels it as development only. Set up a permanent release keystore through GitHub Secrets before distributing production APKs. Different CI builds may require uninstall due to debug-key changes.

The Mail Desk Worker `ALLOWED_ORIGINS` deployment must include the native WebView origin (typically `http://localhost`) for CORS, with token checks intact. Changes to Cloudflare deployment settings are not made automatically by this repository.

Invoice verification links generated from native now fall back to the public `https://order.nalaro.digital/verifi/` rather than an inaccessible local WebView address.

Do not mark this APK production ready without device login, file/share, Mail Desk, QR scan, push and OTA rollback tests, as well as Firestore emulator concurrency and rules tests.

QR scanner: More → Pindai QR Verifikasi; accepts Nalaro HTTPS verification links or a raw 20–64 character token, then performs in-app Firestore verification. It does not open untrusted scanned URLs.

The mailbox Worker source also recognizes the fixed Android Capacitor origin `http://localhost`. This Worker change must be deployed separately; a GitHub source commit does not automatically update the Cloudflare Worker.

## Permissions and background features

Push notifications need Firebase's Android app configuration. Register package `nalaro.projectdesk` with Firebase, set the GitHub Actions secret `FIREBASE_ANDROID_CONFIG_BASE64` to the base64-encoded `google-services.json`, and deploy the receiving token backend. The Android app no longer prompts for notification permission immediately upon login while this feature is unfinished. Notifications and self-hosted OTA require end-to-end device/rollback validation.

PDF sharing now supplies an Android file attachment rather than a URL to the Share Sheet.

The checked-in `workers/mailbox/dashboard-worker.js` has been kept in step with this origin rule. Regenerate it with `npm run build:mailbox` before deploying to Cloudflare to avoid artifact drift.

## 2026-10-09 login and Firebase Android registration

Fixed a nested else in Login.tsx that signed out valid admins on Android. There is now exactly one Firebase auth observer for the native screen switcher; after successful login it swaps views without a WebView navigation. Login always stops its loading spinner, and Firebase session bootstrap has a 15-second retry screen.

**Android applicationId changed from `nalaro.projectdesk` to `com.nalaro.app`**, matching the Firebase Android app registration supplied by the owner. Because Android package identity has changed, this installs as a separate application from the previous APK: uninstall the earlier `nalaro.projectdesk` build when it is no longer needed. Do not expect an in-place update.

The uploaded Firebase `google-services.json` should be installed only via GitHub Actions secret `FIREBASE_ANDROID_CONFIG_BASE64` (base64 of complete original JSON); it is not checked into this public repository. It is required for Firebase Messaging/FCM, **not** for Firebase Auth email/password, which still uses Firebase's existing Web SDK client configuration for the same project `nalaro`. Enable Email/Password in Firebase Authentication. Restrict any client API keys appropriately for their platform.

Icons are generated from the **existing** `public/brand/nalaro.png` via `scripts/generate_android_icons.py` during CI (Pillow dependency), including legacy, circular and adaptive foreground. Adaptive background is Nalaro ink black, not the previous Android default white/green.
