# macOS App and Open Source Plan

## Product Direction

Codex Log Viewer should be a local-first macOS app for inspecting Codex usage across projects. The app should feel like a desktop utility: double-click launch, no required terminal workflow, no hosted service, and no automatic upload of logs.

The existing TypeScript parser, analytics package, local API engine, and CLI remain valuable. The app surface is native SwiftUI, with the TypeScript parser and local API acting as the local engine until there is a reason to port core parsing into Swift.

## Immediate Track

1. Add a SwiftUI macOS app in `apps/macos`.
2. Start the private local API engine on an app-owned `127.0.0.1` port from inside the native app process.
3. Fetch projects, summaries, sessions, and search results from the local API.
4. Use native macOS layout patterns: sidebar, toolbar, tables, split detail pane, and inspector.
5. Keep user-facing workflows in the native app.

## Search Requirements

The product must support searching every parsed message across every project, with filters for:

- all projects or one selected project
- date range
- default Codex log roots or custom paths
- role, model, and session
- eventually repeated-message status

The first implementation can be scan-based because it reuses the parsed in-memory corpus and keeps the behavior easy to test. For larger histories, search should move to a local index.

## Search Architecture Roadmap

Phase 1 uses the parser output directly:

- parse all selected JSONL logs locally
- normalize message text consistently
- return timestamp, role, project, session, source event, and snippet
- never send search data outside the machine

Phase 2 should add a local persistent search index:

- store an app-local SQLite database under the user's application-support directory
- use SQLite FTS5 for message search
- index session id, project, cwd, timestamp, role, model, source file, source event, and normalized content
- rebuild or incrementally update the index when log files change
- keep the index out of git and out of fixtures

Phase 3 should add richer app workflows:

- saved searches
- redacted export from search results

## Desktop App Roadmap

Phase 0 gets the native app running quickly:

- SwiftUI app target
- local backend startup
- native sidebar, tables, toolbar, search, and inspector
- root script: `npm run app:mac`

Phase 1 makes it feel complete as a macOS app:

- file and folder picker for custom log sources
- recent source locations
- app settings stored locally
- toolbar search with role/model/date facets
- source list, session list, message list, and inspector refinements
- better empty states and scan progress
- graceful error recovery when logs are malformed or inaccessible

Status: native source picking, recent source settings, date-filter settings, role/model/session search filters, search result session context, repeated-prompt grouping, first-pass empty states, keyboard shortcuts, retry recovery, and release-critical smoke automation are implemented for v0.1. Deeper VoiceOver QA, selection-navigation shortcuts, and persistent indexed search remain follow-up work.

Phase 2 prepares public releases:

- `.app` bundle generation
- DMG or zip artifacts
- app icon
- code signing and notarization notes
- release checklist
- GitHub Actions release workflow

Status: `.app` bundle generation, zip/checksum artifacts, app icon, signing/notarization path, release checklist, release notes template, and tag-based GitHub Release workflow are implemented. Official notarized artifacts still require Developer ID and notary credentials.

Phase 3 improves scale:

- persistent local parsed cache (implemented)
- incremental parsed-session refresh (implemented)
- FTS-backed search
- large-history performance tests
- memory and startup-time budgets

## Open Source Readiness

Before the first public push, confirm:

- no unsanitized local Codex logs are committed
- fixtures are synthetic or manually sanitized
- README leads with the macOS app and documents the CLI as an automation fallback
- contribution docs explain fixture rules
- security docs explain that logs may contain secrets
- CI runs parser, analytics, local engine, CLI, and native app builds
- issues and PR templates remind contributors not to upload private sessions

## Technical Choice

SwiftUI is the primary app technology. The TypeScript parser and server remain the local engine for now because they are already tested and fixture-driven.
