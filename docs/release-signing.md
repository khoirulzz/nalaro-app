# Nalaro Android production release signing

The Gradle Release variant is now non-debuggable, minified and shrinked. **No debug signing is ever used for production release.** It builds an unsigned APK unless the following environment variables are present:

- NALARO_RELEASE_STORE_FILE — path to the stable Android keystore (relative to android/app)
- NALARO_RELEASE_STORE_PASSWORD
- NALARO_RELEASE_KEY_ALIAS
- NALARO_RELEASE_KEY_PASSWORD

GitHub Actions can use encrypted secrets with the names `NALARO_RELEASE_STORE_BASE64`, `NALARO_RELEASE_STORE_PASSWORD`, `NALARO_RELEASE_KEY_ALIAS`, `NALARO_RELEASE_KEY_PASSWORD`; it decodes a temporary keystore and wipes it after the build. Avoid committing either the keystore or its passwords to public GitHub.

When no signing secrets are configured, CI uploads an **unsigned release** and an independently buildable **debug development APK**. Production cannot use unsigned APK. Generate a permanent upload key and back it up offline. Losing it prevents in-place updates to an APK signed with that certificate. Users of previous debug-signed APKs must uninstall the test build before installing a separately signed production APK. Existing Firebase Firestore data stays in the cloud.

Run `apksigner verify --verbose --print-certs <APK>`, confirm `android:debuggable=false`, install on a physical device, and test login, Mail Desk, FCM push, invoice/receipt and deep links before publishing. Save SHA-256 and the signing kit in two secure backups.
