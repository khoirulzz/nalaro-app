# Android Mail Desk and FCM network fix (October 2026)

## Root cause
Capacitor Android's default WebView origin is **https://localhost**. Production Cloudflare Mailbox and Notify Workers allowed only **http://localhost**, which made CORS preflight fail before Firebase authentication or mail APIs could be reached. CI previously tested only `http://localhost`, so this escaped validation.

## Fix
- Keep web on its existing mailbox endpoint; use `https://mail-api.nalaro.digital` on Android.
- Use `https://notify-api.nalaro.digital` for native FCM.
- Cloudflare Worker Custom Domains map each hostname to its existing Worker.
- Both Workers accept exact `https://localhost` and legacy `http://localhost` origins; no wildcard origin.
- Android scheme made explicit in Capacitor config to prevent regressions.
- Worker API and Firebase-native errors are distinguished in Android UI, without logging tokens.
- Test both origins against deployed custom domains in CI.
- Email/FCM business logic unchanged; Firestore rules and public web untouched.

## Device acceptance
Install build 1.0.3, log in, confirm Mail Desk loads, create/send a test draft, confirm invoice/receipt email action. In More, enable FCM, verify registered device, then press self-test. If a message still fails, capture the now-specific stage and network error and provide it for further diagnosis.

**Note:** CI preflight and successful build cannot guarantee Android device delivery. Test with device network and battery settings. APK remains development/debug-signed.
