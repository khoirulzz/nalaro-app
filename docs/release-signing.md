# Nalaro Android production release signing

The Gradle Release variant is now non-debuggable, minified and shrinked. **No debug signing is ever used for production release.** It builds an unsigned APK unless the following environment variables are present:

- NALARO_RELEASE_STORE_FILE — path to the stable Android keystore (relative to android/app)
- NALARO_RELEASE_STORE_PASSWORD
- NALARO_RELEASE_KEY_ALIAS
- NALARO_RELEASE_KEY_PASSWORD

GitHub Actions can use encrypted secrets with the names `NALARO_RELEASE_STORE_BASE64`, `NALARO_RELEASE_STORE_PASSWORD`, `NALARO_RELEASE_KEY_ALIAS`, `NALARO_RELEASE_KEY_PASSWORD`; it decodes a temporary keystore and wipes it after the build. Avoid committing either the keystore or its passwords to public GitHub.

When no signing secrets are configured, CI uploads an **unsigned release** and an independently buildable **debug development APK**. Production cannot use unsigned APK. Generate a permanent upload key and back it up offline. Losing it prevents in-place updates to an APK signed with that certificate. Users of previous debug-signed APKs must uninstall the test build before installing a separately signed production APK. Existing Firebase Firestore data stays in the cloud.

Run `apksigner verify --verbose --print-certs <APK>`, confirm `android:debuggable=false`, install on a physical device, and test login, Mail Desk, FCM push, invoice/receipt and deep links before publishing. Save SHA-256 and the signing kit in two secure backups.

## Initial production certificate — 2026-10-09

The initial production-signed v1.1.0 APK and encrypted signing recovery kit were built using a one-time GitHub Actions bootstrap. **The bootstrap block has been removed** from the repository after recovering and verifying its keystore. Do not regenerate the key: upload the recovered stable key via the four encrypted GitHub Actions Secrets before producing future production APKs. Unsigned release artifacts are not installable.

Initial certificate SHA-256: `6B:84:A8:1D:87:14:60:91:28:7C:51:74:4D:BE:37:BA:E4:6D:B5:A6:DE:EE:55:7C:74:AD:1F:8C:4F:E1:E7:EC`.

## Preparing v1.1.1 (versionCode 7)

The Mail Desk image/attachment update requires a higher versionCode than initial production 1.1.0 (versionCode 6). The signing-enabled build checks the actual signed APK fingerprint against the initial production signer.

The first production release and its encrypted signing kit were archived in GitHub Actions run 37902122774. Artifact `nalaro-production-signing-kit-encrypted` contains `signing-recovery.cms`. It was encrypted for the public recipient certificate in historical commit `f8c7873e5a46826fc59565e99be20da941bf1c5d` at `docs/release-bootstrap-recipient.pem`.

To recover the original keystore, its owner **must possess the matching recipient PRIVATE key**. The public certificate and signed APK cannot decrypt it. On a trusted computer, decrypt with:

```sh
openssl cms -decrypt -inform DER -in signing-recovery.cms -recip recipient.pem -inkey recipient-private.key -out signing-recovery.tar.gz
mkdir recovered-signing
tar -xzf signing-recovery.tar.gz -C recovered-signing
```

The decrypted archive contains `nalaro-production.jks`, `store-and-key-password.txt`, and `key-alias.txt`. Configure the four encrypted GitHub Actions secrets `NALARO_RELEASE_STORE_BASE64`, `NALARO_RELEASE_STORE_PASSWORD`, `NALARO_RELEASE_KEY_ALIAS`, and `NALARO_RELEASE_KEY_PASSWORD` without committing any private material. The initial key uses the same password for store and key.

When those secrets are populated, the GitHub Actions workflow will sign the release and reject any mismatching certificate. Never distribute unsigned or debug builds as production. An APK installed from a different applicationId or certificate cannot be updated in place.
