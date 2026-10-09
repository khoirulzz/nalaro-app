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

## New personal-production key (10 Oct 2026)

A new independent production signing key replaces the prior unowned key for the *personal* Nalaro Project Desk app. The package is unchanged at `com.nalaro.app`, and app features are unchanged; only `versionName 1.1.1` / `versionCode 7` and release bootstrap configuration differ from the merged Mail Desk image/attachment fix.

During a one-time build, the key is generated with RSA 3072 and a random password inside GitHub Actions, the APK is signed with this key, and an encrypted signing kit is produced for owner recovery. **After recovering the new keystore, remove the one-time bootstrap workflow steps**; preserve the recovered JKS and password offline, and configure the four encrypted `NALARO_RELEASE_*` GitHub Actions secrets for all future production builds.

Because the new certificate is different from ALL earlier releases, the old `com.nalaro.app` installation must be uninstalled before installing v1.1.1. The online Firebase data remains on the server; any device-local files should be backed up before uninstall.

Never distribute the unsigned or debug APK as a production update. Record the signed APK and restored keystore certificate fingerprints and confirm they match before release.

## Personal APK shipped (signed) — 10 Oct 2026

**This is the active, owner-held signing identity for future v1.1.1+ releases.** Older initial production signing certificate in the historical section above is no longer used for this personal app.

- Application ID: `com.nalaro.app`
- Version: `1.1.1`; versionCode: `7`
- Certificate SHA-256: `FF:A5:99:5D:75:D3:57:3A:EF:11:33:16:54:B3:05:FE:15:80:5F:8C:4A:E1:DF:9F:27:0F:63:35:E6:3B:EF:EB`
- CI proof of initial production APK and owner-encrypted signing kit: https://github.com/khoirulzz/nalaro-app/actions/runs/37968434352
- The signing kit has been recovered and provided to the owner separately. **No owner private key or password was committed to the repository.**
- The temporary key-generation step and public transport certificate have been removed from the repository after recovery. Future CI builds use only the owner's GitHub Actions Secrets, never generate a new signing identity.
- The signing-enabled production build checks the expected fingerprint before uploading production artifacts; if secrets are not configured the CI provides unsigned/debug artifacts only.
- Upgrading an older APK signed with another certificate requires uninstalling that APK after backing up device-local data. Firestore cloud data remains intact.

To enable future production APK builds, add these GitHub repository Actions secrets: `NALARO_RELEASE_STORE_BASE64` (base64 of the recovered JKS), `NALARO_RELEASE_STORE_PASSWORD`, `NALARO_RELEASE_KEY_ALIAS`, `NALARO_RELEASE_KEY_PASSWORD`. Keep the JKS and password bundle offline and back it up securely.
