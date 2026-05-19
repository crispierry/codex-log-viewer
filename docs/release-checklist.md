# Release Checklist

Use this checklist before publishing a public Codex Log Viewer version.

## Versioning

- Use semantic versions beginning with `0.1.0`.
- Keep `package.json`, `CHANGELOG.md`, and Git tags aligned.
- Tag releases as `vX.Y.Z`; the GitHub Release workflow runs from tags that start with `v`.
- The release workflow fails if the tag does not match `package.json` as `v<version>`.

## Required Verification

Run from a clean checkout:

```sh
npm ci
npm run privacy:scan
npm run test:all
npm audit --audit-level=moderate
npm run benchmark:search
npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app
npm run release:mac
(cd dist/macos && shasum -a 256 -c Codex-Log-Viewer-v0.1.0-macOS.zip.sha256)
npm run release:notes -- --tag v0.1.0 --output dist/macos/release-notes.md
git diff --check
```

On macOS, `npm run release:mac` builds `Codex Log Viewer.app`, launches the packaged smoke workflow twice, verifies Finder-style and relocated `.app` launches, verifies missing-engine failure diagnostics, checks that the local engine exits, and runs a native UI smoke check against sanitized fixtures.

The tag-based GitHub Release workflow repeats the privacy scan, required source checks, audit, benchmark, sanitized reference parity harness, package build, packaged app smoke, native UI smoke, checksum verification, and release-note rendering before creating a release.

## Private Reference Parity

The fixture reference check above proves the parity harness. Before an official public release, a maintainer should run the same command shape against a private reference report and private local logs outside the repository:

```sh
npm run check:reference -- \
  --reference /path/outside/repo/private-reference-summary.json \
  --path /path/outside/repo/private-codex-logs \
  --project "Private Project Name" \
  --tolerance 0.01
```

Do not commit the private reference, private logs, generated reports, screenshots, or terminal output from that run.

## Signing And Notarization

Local builds use ad-hoc signing. For an official macOS artifact, configure a release machine or GitHub runner with a Developer ID Application certificate and a notarytool keychain profile:

```sh
CODEX_LOG_VIEWER_CODESIGN_IDENTITY="Developer ID Application: Example (TEAMID)" \
CODEX_LOG_VIEWER_NOTARY_PROFILE="codex-log-viewer-notary" \
CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1 \
npm run release:mac
```

When those variables are set, the packaging script signs with hardened runtime, submits the app for notarization, staples the ticket, and then creates the final zip and checksum.

The tag-based GitHub Release workflow sets `CODEX_LOG_VIEWER_REQUIRE_NOTARIZATION=1` for packaging. It will not publish an ad-hoc signed artifact as an official release. Configure these repository secrets before pushing `vX.Y.Z`:

- `CODEX_LOG_VIEWER_CODESIGN_IDENTITY`
- `CODEX_LOG_VIEWER_MACOS_CERTIFICATE_BASE64`
- `CODEX_LOG_VIEWER_MACOS_CERTIFICATE_PASSWORD`
- `CODEX_LOG_VIEWER_NOTARY_PROFILE`
- `CODEX_LOG_VIEWER_APPLE_ID`
- `CODEX_LOG_VIEWER_APPLE_TEAM_ID`
- `CODEX_LOG_VIEWER_APP_SPECIFIC_PASSWORD`

`CODEX_LOG_VIEWER_MACOS_CERTIFICATE_BASE64` should be a base64-encoded `.p12` export containing the matching Developer ID Application certificate and private key. The workflow imports it into a temporary keychain, creates the notarytool keychain profile from the Apple ID/team/app-specific password secrets, signs, notarizes, staples, verifies the checksum, and only then creates the GitHub Release.

On macOS, encode the exported `.p12` without committing it:

```sh
base64 -i DeveloperIDApplication.p12 | pbcopy
```

Paste the copied value into the `CODEX_LOG_VIEWER_MACOS_CERTIFICATE_BASE64` repository secret, then delete the local export when it is no longer needed.

## Artifact Review

- Confirm `dist/macos/Codex-Log-Viewer-vX.Y.Z-macOS.zip` exists.
- Confirm the matching `.sha256` file exists.
- Confirm the checksum file contains the zip basename, not a build-machine absolute path.
- Unzip the artifact and launch the app from Finder.
- Confirm the app opens without `CODEX_LOG_VIEWER_REPO`.
- Confirm the app can scan `fixtures/codex/sample-session.jsonl`.
- Confirm no local engine process remains after quitting.

## Public Release Notes

Start from [Release Notes Template](release-notes-template.md). Release notes should include:

- the native macOS-only product scope
- privacy model: local parsing, loopback engine, ephemeral token, redacted default JSON
- known limitations: raw session inspection is private, search is scan-based, no auto-update yet
- checksum verification command:

```sh
shasum -a 256 -c Codex-Log-Viewer-vX.Y.Z-macOS.zip.sha256
```
