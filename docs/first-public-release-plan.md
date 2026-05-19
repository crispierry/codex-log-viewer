# First Public Release Plan

This plan tracks the remaining work before Codex Log Viewer is ready for a first public version. It assumes the first public version is a native macOS release, not a web app, and that local Codex logs stay on the user's machine by default.

Last reviewed: 2026-05-19

## Release Definition

The first public version should be something an outside user can understand, trust, and run without knowing the history of this repository.

Target outcome:

- a native macOS app is the primary product surface
- no browser dashboard or Electron app is shipped
- the parser and analytics are accurate for the supported Codex log shapes
- message search works across all projects and can be filtered by project, date range, and source path
- the app can be installed and launched as a packaged `.app`
- privacy expectations are explicit before users inspect or export local logs
- CI verifies parser, analytics, local engine, CLI, macOS build, package creation, and at least one native app smoke path

## Execution Status

Implemented for v0.1:

- native-only macOS product surface; no web dashboard or Electron shell
- packaged `.app` build with metadata, icon, bundled local engine, bundled Node runtime, zip artifact, and checksum
- optional Developer ID signing and notarization path through environment variables
- packaged app smoke workflow that verifies engine startup, API access, search, session detail, exports, repeated launch, Finder-style `.app` launch, relocated `.app` launch outside the repo, missing-engine failure diagnostics, and child-process cleanup
- native UI smoke workflow through macOS accessibility automation using sanitized fixtures and ephemeral settings; it verifies source loading, project/date selection, search, session context, session-scoped search, and export data
- per-run local API bearer token for data endpoints
- native source picker, recent source settings, date-filter settings, and local-only settings persistence
- search result copy actions for session id, project, and sanitized snippets
- repeated-prompt grouping with counts across the current project/source/date filters
- first-pass native empty states, failure retry action, and keyboard shortcuts for refresh, find, search, source picking, and exports
- parser fixture coverage for supported event shapes, null token info, malformed lines, unknown payloads, and tool events
- analytics tests for date/project filtering, diagnostics filtering, model/session search filters, token aggregation, and redacted exports
- redacted JSON exports by default with explicit raw JSON for private local use
- search benchmark with documented threshold and future SQLite FTS5 trigger
- private-reference parity harness with a sanitized fixture reference report
- release notes template, manual-update position, checksum guidance, and tag-based release workflow
- public GitHub repository settings: description, topics, private vulnerability reporting, and protected `main` with required `verify` and `macos-app` checks

External release prerequisites:

- Developer ID certificate and notarytool keychain profile are required to produce a notarized public macOS artifact.
- A maintainer should run the private-log parity check locally with a private reference report, without committing private inputs or outputs.
- PR #8 is blocked only on the configured review requirement before merge/tag.

## Current State

Already done:

- Native SwiftUI app exists in `apps/macos`.
- Web dashboard and Electron prototype are removed.
- Local TypeScript API engine is private to the app and no longer serves web assets.
- CLI remains for automation and smoke tests.
- Cross-project message search exists with project/date/source filters.
- Parser, analytics, server, and Swift build pass in `npm run test:all`.
- Server entrypoint handles paths with spaces.
- Date-filtered summaries remove out-of-range sessions.
- Native search requests are cancelled when filters change.
- Open-source hygiene docs, security policy, issue templates, and CI exist.

## P0 Release Blockers

These must be done before publishing a downloadable first version.

### 1. Package A Real macOS App

Gap:

- `npm run app:mac` is still a development runner that depends on a repo checkout, Node, built JS files, and `swift run`.
- There is no packaged `.app`, app icon, Info.plist, release artifact, signing, or notarization path.

Plan:

- Add a macOS app bundle target or packaging script that emits `Codex Log Viewer.app`.
- Add app metadata: bundle identifier, version, copyright, display name, minimum macOS version, and icon.
- Decide the v0.1 engine strategy:
  - bundle the built TypeScript engine and a known Node runtime, or
  - require a documented external Node install for source builds only, or
  - port enough parsing/analytics into Swift to remove Node from packaged releases.
- For v0.1, prefer bundling the local engine so users do not need to run terminal setup.
- Add a release artifact workflow that produces a zip or DMG from a clean checkout.
- Add signing and notarization notes even if the first public source release uses ad-hoc signing.

Acceptance:

- A clean checkout can run one command to produce `Codex Log Viewer.app`.
- The app launches from Finder without `CODEX_LOG_VIEWER_REPO`.
- The app can locate its bundled local engine.
- The package is verified on a machine/account without the development worktree.

### 2. Verify Packaged App Behavior

Gap:

- CI builds the Swift executable, but it does not verify a packaged app.
- There is no test that launches the packaged app and confirms the local engine starts.

Plan:

- Add a macOS CI job that packages the app.
- Launch the packaged app or its executable from the generated bundle.
- Confirm the local engine starts, health check passes, and the app can scan the sanitized fixture path.
- Verify app termination stops the local engine.
- Archive package logs only from sanitized fixture runs.

Acceptance:

- CI fails if the packaged app cannot start.
- CI fails if the packaged app cannot reach `/api/health`.
- CI fails if the packaged app depends on source-tree-only paths.

### 3. Add Native macOS UI Automation

Gap:

- There is no native UI automation for the SwiftUI app.
- Manual UI checks are documented, but not enforced.

Plan:

- Add an Xcode project or test harness that supports XCTest/XCUITest for the app.
- Add accessibility identifiers for core controls and tables.
- Cover the minimum release workflow:
  - launch app
  - app reaches ready state
  - choose sanitized fixture source
  - see `sample-app`
  - select all projects and one project
  - apply date filters
  - search messages across all projects
  - select a search result
  - select a session
  - export JSON and CSV to a temp directory
- Add at least one failure-state test for invalid source path or missing engine.

Acceptance:

- A native UI test suite runs on macOS CI.
- Core controls are addressable through stable accessibility identifiers.
- The first-run path and search/session inspection path are covered.

### 4. Harden Local API Security

Gap:

- The local API binds to loopback and uses a random app-owned port, but there is no per-run authentication token.
- Any local process that discovers the port can call endpoints and request paths.

Plan:

- Generate an ephemeral token in the native app before starting the local engine.
- Pass the token to the engine through env or launch arguments.
- Require the token on every API route except maybe `/api/health`, or expose a token-protected health endpoint for the app.
- Keep the token out of logs and UI.
- Consider restricting path access to app-selected source roots after startup.

Acceptance:

- API requests without the token fail.
- API requests with the token succeed.
- Tests cover unauthorized and authorized requests.
- The token is not printed in server diagnostics.

### 5. Add Startup Conflict And Lifecycle Tests

Gap:

- There is a path-with-spaces startup test, but no startup conflict test.
- App lifecycle behavior is only lightly covered.

Plan:

- Add a server test where the default port is already occupied and startup reports a clear failure.
- Add a server test proving `--port=0` avoids fixed-port conflicts.
- Add an app/engine smoke test for multiple launches or an existing stale engine.
- Test shutdown cleanup:
  - normal app quit terminates child engine
  - failed startup removes temp files
  - repeated start/stop cycles do not leak processes
- Add diagnostics that are useful but do not expose sensitive log content by default.

Acceptance:

- Startup conflict behavior is deterministic and tested.
- App-owned random-port startup still succeeds when common ports are occupied.
- No local engine process is left running after tests.

### 6. Improve Native Source Selection And Settings

Gap:

- Custom sources are typed into a text box.
- There is no native file/folder picker, recent sources list, or persisted settings.

Plan:

- Replace or supplement the source text editor with native file and folder pickers.
- Support adding multiple sources, removing sources, and resetting to default Codex roots.
- Persist recent source locations in local app settings.
- Persist non-sensitive user preferences such as last selected source and date range.
- Clearly distinguish default Codex roots from custom paths.

Acceptance:

- Users can choose files/folders without typing paths.
- Recent sources survive app restart.
- Settings are local and not committed, exported, or uploaded.

### 7. Strengthen Parser And Analytics Accuracy

Gap:

- Fixture coverage is still thin relative to the number of observed Codex event shapes.
- The docs say metrics should be accurate, but there is no broad parity suite.

Plan:

- Add fixture tests for each supported event shape:
  - `session_meta`
  - `turn_context`
  - `event_msg.user_message`
  - `response_item.message`
  - `response_item.reasoning`
  - `response_item.function_call`
  - `response_item.function_call_output`
  - custom tool calls and outputs
  - exec and patch events
  - task timing events
  - token count events with populated `info`
  - token count events with `info: null`
  - unknown top-level and payload types
- Add malformed-line tests with line numbers and warning codes.
- Add aggregation tests for:
  - cumulative token dedupe
  - model buckets
  - date boundaries
  - project filters
  - unknown event counts
  - parse warning counts
- Run a local private parity check against known reference reports without committing private logs.
- Document which metrics are exact, inferred, or intentionally not supported.

Acceptance:

- Supported event shapes each have sanitized fixtures.
- Parser behavior is stable under malformed JSONL.
- Analytics match the private reference report within an agreed tolerance.
- README and docs do not overclaim unsupported metrics.

### 8. Add Privacy-First Export And Inspection Controls

Gap:

- JSON summary exports include local file paths and cwd values.
- Session detail inspection displays raw message content.
- There is no redacted export mode or explicit export privacy prompt.

Plan:

- Add export modes:
  - aggregate-only JSON/CSV
  - redacted detailed JSON
  - explicit raw local export, if needed later
- Add a clear warning before exporting data that includes paths, cwd, snippets, or message content.
- Redact or omit local paths by default in shareable exports.
- Add tests for redaction behavior.
- Document exactly which fields each export mode includes.

Acceptance:

- Default exports are safe to share after normal review.
- Raw/detail exports are clearly labeled as private.
- Redaction tests cover paths, cwd values, message text, and tool output fields.

## P1 Important Before Broad Promotion

These should not block a small source preview, but they should happen before actively promoting the app.

### 9. Make Search Scale Beyond Small Histories

Gap:

- Search scans the parsed in-memory corpus.
- Large histories may be slow and memory-heavy.

Plan:

- Add performance fixtures or synthetic large-history generators.
- Define startup, refresh, and search latency budgets.
- Add a local SQLite cache with FTS5 when scan-based search no longer meets the budget.
- Incrementally update the index based on path, size, and modification time.
- Keep the index under Application Support and out of git.

Acceptance:

- Search performance is measured against a representative large corpus.
- The app remains responsive during scans and searches.

### 10. Improve Search And Session Workflows

Status:

- Search supports project/date/source, role, model, selected-session scoping, full session context, matching-message highlighting, repeated-prompt grouping, and copy actions.

Remaining:

- Saved searches remain a later enhancement.

Plan:

- Add role and model filters.
- Add a session filter or quick action from session table to search within session.
- Link search results to their full session detail.
- Highlight the matching message in context.
- Add repeated-prompt grouping and counts.
- Add copy actions for session id, project, and sanitized snippet.

Acceptance:

- A user can go from global search result to full session context in one action.
- Search filters are visible, native, and tested.

### 11. Improve App UX, Accessibility, And Error Handling

Status:

- The first native pass covers empty states, scan messaging, failed-scan retry, stable accessibility identifiers, and core keyboard shortcuts.

Remaining:

- Deeper VoiceOver QA and selection-navigation shortcuts still need manual validation before broad promotion.

Plan:

- Add clearer empty states for no logs, no projects, no search results, and invalid sources.
- Add visible scan progress or at least scan phase messaging.
- Keep the UI responsive during large parses.
- Add retry/recover actions for failed engine startup and failed scans.
- Add keyboard shortcuts for refresh, search focus, export, source picker, and selection navigation.
- Add accessibility labels/identifiers and verify VoiceOver basics.
- Verify layout at smaller window sizes and long project/path names.

Acceptance:

- Common failure states are understandable to non-technical users.
- Core workflows work by keyboard.
- UI automation and manual QA cover long labels, empty states, and failures.

### 12. Add App Update And Release Operations

Gap:

- There is no versioning, changelog automation, release checklist, or update story.

Plan:

- Define semantic versioning for app and packages.
- Add release notes template.
- Add GitHub release workflow.
- Decide whether v0.1 needs an auto-update framework or just manual downloads.
- Document checksum/signature verification.

Acceptance:

- A release can be cut from a tag with repeatable artifacts.
- Release notes describe privacy and known limitations.

## P2 Later Enhancements

These are valuable but should not block the first public version.

- Git-root based project grouping.
- User-defined project alias configuration.
- Full raw event payload explorer.
- API-equivalent cost estimates.
- Saved searches.
- Rich charts for day/hour/model trends.
- Multi-window support.
- Import/export of app settings.
- Support for non-Codex coding-agent logs.

## Verification Matrix

Before tagging the first public version, run and record:

- [x] `npm ci`
- [x] `npm run test:all`
- [x] `npm audit --audit-level=moderate`
- [x] `git diff --check`
- [x] server auth tests
- [x] server startup conflict tests
- [x] packaged app build
- [x] packaged app launch smoke test
- [x] native UI smoke automation suite
- [x] sanitized fixture QA through packaged app and native UI smoke tests
- [x] sanitized reference-report parity harness
- [ ] private reference-report parity check, maintainer-local only
- [x] privacy scan for unsanitized logs, screenshots, recordings, exports, secrets, and local caches
- [x] documentation review from a first-time-user perspective

## Public Release Checklist

- [x] No web dashboard or Electron app is present.
- [x] README describes the native macOS app first.
- [x] Install/run instructions work from a clean checkout.
- [x] Downloadable app instructions work without a repo checkout.
- [x] App icon and metadata are present.
- [x] Local API requires an ephemeral token.
- [x] Local engine lifecycle is tested.
- [x] Search across all projects is tested.
- [x] Project/date/source filters are tested.
- [x] Parser fixtures cover all claimed event shapes.
- [x] Export privacy modes are documented and tested.
- [x] Issue templates warn against raw logs.
- [x] Security policy explains private vulnerability reporting.
- [x] CI branch protection is enabled after publishing to GitHub.
- [x] GitHub release artifacts are generated from CI.
- [x] Known limitations are documented honestly.

## Suggested Work Order

1. Package the app and remove repo checkout assumptions.
2. Add local API auth and startup/lifecycle tests.
3. Add native source picker and persisted settings.
4. Add native UI automation for the core workflow.
5. Expand parser fixtures and analytics parity tests.
6. Add privacy-first export modes.
7. Add packaged app CI and release artifact workflow.
8. Do final docs, privacy, and clean-machine QA.
