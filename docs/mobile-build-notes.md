# Nalaro Mobile Release Notes

The GitHub Actions mobile workflow builds Astro with `PUBLIC_NATIVE_APP=true`, producing a native-only root and Firebase session bootstrap. It is isolated from the browser/public root build.

Android internal routes use a HashRouter; the WebView should never fully reload to `/login` or `/admin`.

**Important:** Current Gradle `assembleRelease` output is signed with the Android debug key. GitHub Actions currently labels it as development only. Set up a permanent release keystore through GitHub Secrets before distributing production APKs. Different CI builds may require uninstall due to debug-key changes.

The Mail Desk Worker `ALLOWED_ORIGINS` deployment must include the native WebView origin (typically `http://localhost`) for CORS, with token checks intact. Changes to Cloudflare deployment settings are not made automatically by this repository.

Invoice verification links generated from native now fall back to the public `https://order.nalaro.digital/verifi/` rather than an inaccessible local WebView address.

Do not mark this APK production ready without device login, file/share, Mail Desk, QR scan, push and OTA rollback tests, as well as Firestore emulator concurrency and rules tests.

QR scanner: More → Pindai QR Verifikasi; accepts Nalaro HTTPS verification links or a raw 20–64 character token, then performs in-app Firestore verification. It does not open untrusted scanned URLs.

The mailbox Worker source also recognizes the fixed Android Capacitor origin `http://localhost`. This Worker change must be deployed separately; a GitHub source commit does not automatically update the Cloudflare Worker.
