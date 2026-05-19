# Release Notes Template

Use this template when drafting the GitHub Release body for `vX.Y.Z`. The tag-based release workflow renders this file with `scripts/render-release-notes.mjs`.

## Codex Log Viewer vX.Y.Z

Codex Log Viewer is a local-first native macOS app for inspecting OpenAI Codex session logs across projects.

## Highlights

- Native SwiftUI macOS app for local Codex log analytics.
- Four-column Browse flow for projects, sessions, sent messages, and Codex interactions.
- Cleaner project sidebar with source selection in the Logs menu and date filtering in the workspace header.
- Cross-project message search with project, source, date, role, model, and session filters.
- Messages I Sent browsing with structured Codex interaction detail for each selected prompt.
- Repeated-prompt grouping and native copy actions for search results.
- Packaged `.app` artifact with bundled local parser engine and bundled Node runtime.
- Redacted JSON exports by default and aggregate CSV exports.

## Privacy Model

- Logs are parsed locally on the user's Mac.
- The app starts a private loopback parser engine on an app-owned port.
- Data endpoints require an ephemeral per-run bearer token.
- Default JSON exports redact local source paths and working directories.
- Default JSON exports redact repeated-prompt sample text and content-derived IDs.
- Users should still review exports before sharing because project names, timestamps, session IDs, model names, and aggregate metadata may be sensitive.

## Known Limitations

- Raw session inspection is a private local view and may show message content from local logs.
- Parsed sessions are cached locally between launches. Search is still scan-based over the loaded parsed corpus; a local SQLite FTS index is planned when larger histories need it.
- There is no auto-update framework yet; users install updates manually from GitHub Releases.
- Official notarized artifacts require the release to be built with Developer ID and notary credentials.

## Verification

- `npm run test:all`
- `npm audit --audit-level=moderate`
- `npm run benchmark:search`
- `npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app`
- `npm run release:mac`
- `shasum -a 256 -c Codex-Log-Viewer-vX.Y-buildN-macOS.zip.sha256`
- maintainer-local private reference parity check, if this is an official public release

## Downloads

- `Codex-Log-Viewer-vX.Y-buildN-macOS.zip`
- `Codex-Log-Viewer-vX.Y-buildN-macOS.zip.sha256`

Verify the checksum:

```sh
shasum -a 256 -c Codex-Log-Viewer-vX.Y-buildN-macOS.zip.sha256
```
