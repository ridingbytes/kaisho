# macOS Code Signing & Notarization

This document covers the Apple Developer ID certificate
setup for signing and notarizing the Kaisho desktop app.

## Overview

Without code signing, macOS users see "Kaisho is damaged"
or must use Privacy & Security workarounds. With a
Developer ID Application certificate, the app opens
cleanly on any Mac.

## Certificate Files

Stored in `~/.kaisho/certificates/` (not committed):

| File | Purpose |
|------|---------|
| `kaisho-devid.key` | Private key (RSA 2048) |
| `kaisho-devid.csr` | Certificate signing request |
| `developerID_application.cer` | Apple-issued certificate |
| `kaisho-devid.pem` | Certificate in PEM format |
| `kaisho-devid.p12` | PKCS12 bundle (cert + key) |

## GitHub Secrets

Set in `ridingbytes/kaisho` > Settings > Secrets > Actions:

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE` | Base64 of `kaisho-devid.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password set on the .p12 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Ramon Bartl (75EHWS7L8X)` |
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | `75EHWS7L8X` |

The `APPLE_PASSWORD` is an app-specific password generated
at https://appleid.apple.com > Sign-In and Security >
App-Specific Passwords.

## How the CI Uses Them

The `build-desktop.yml` workflow:

1. Imports the `.p12` into a temporary CI keychain
2. Tauri reads `APPLE_SIGNING_IDENTITY` and signs the
   `.app` bundle with the Developer ID certificate
3. Tauri submits the signed `.app` to Apple's
   notarization service using `APPLE_ID`, `APPLE_PASSWORD`,
   and `APPLE_TEAM_ID`
4. Apple notarizes the app (takes 1-5 minutes)
5. The notarized `.dmg` is uploaded to the GitHub release

## Renewing the Certificate

The certificate expires after 5 years. To renew:

1. Generate a new CSR:
   ```bash
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout ~/.kaisho/certificates/kaisho-devid.key \
     -out ~/.kaisho/certificates/kaisho-devid.csr \
     -subj "/CN=Ramon Bartl/O=Ramon Bartl"
   ```

2. Go to developer.apple.com > Certificates > + >
   Developer ID Application

3. Upload the CSR, download the new `.cer`

4. Convert to `.p12`:
   ```bash
   openssl x509 -in developerID_application.cer \
     -inform DER -out kaisho-devid.pem
   openssl pkcs12 -export \
     -out kaisho-devid.p12 \
     -inkey kaisho-devid.key \
     -in kaisho-devid.pem
   ```

5. Update the `APPLE_CERTIFICATE` GitHub secret:
   ```bash
   base64 -i ~/.kaisho/certificates/kaisho-devid.p12
   ```

## Organization Transfer

When Apple approves the RIDING BYTES GmbH organization
membership, the signing identity will change from
"Ramon Bartl" to "RIDING BYTES GmbH". Update
`APPLE_SIGNING_IDENTITY` in GitHub secrets accordingly.
The Team ID (75EHWS7L8X) stays the same.
