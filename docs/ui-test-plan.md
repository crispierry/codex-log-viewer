# UI Test Plan

## Goal

Make sure Codex Log Viewer can be used from the native macOS app without relying on browser or CLI workflows.

The UI must support:

- selecting log sources
- selecting projects
- filtering by date
- viewing metric cards
- searching messages
- searching sessions
- selecting a session
- seeing session details update
- exporting JSON and CSV
- avoiding stale native-app state during project, date, source, and search changes

## Automated Checks

### Unit And Analytics Tests

Run:

```sh
npm test
```

Covers:

- JSONL parsing
- malformed-line warnings
- unknown-event preservation
- user-message aggregation
- token totals
- model summaries
- message search

### TypeScript Build

Run:

```sh
npm run lint
```

Covers TypeScript compilation for the parser, analytics package, private API engine, and CLI.

### Native App Build

Run:

```sh
npm run build:mac
```

Covers Swift compilation for the native macOS app.

### Packaged App Smoke

Run:

```sh
npm run package:mac
npm run smoke:mac-package
```

Covers packaged app launch, bundled engine discovery, health/API access, fixture scan, cross-project search, session detail loading, JSON/CSV export endpoints, repeated launch, Finder-style `.app` launch, relocated `.app` launch outside the repo, missing-engine failure diagnostics, and child-engine shutdown.

### Native UI Smoke

Run:

```sh
npm run smoke:mac-ui
```

Covers packaged native window launch through macOS accessibility automation using sanitized fixture paths and ephemeral settings. This is a smoke check, not a full replacement for deeper XCUITest coverage.

The smoke workflow also drives the native app model through the release-critical path:

- load the sanitized fixture source
- verify `sample-app` appears
- apply the fixture date filter
- select the sample project
- search messages across all projects
- select a search result and load session context
- verify search-result copy actions for session id, project, and sanitized snippet
- rerun search scoped to the selected session
- verify redacted JSON and aggregate CSV export data

## Manual macOS App Checklist

Run:

```sh
npm run app:mac
```

Check:

- App window opens and becomes active
- Project list appears
- Source paths can be applied and reset to defaults
- Date filters reload metrics
- Selecting a project changes metric cards and session list
- Selecting `All Projects` restores all-project totals
- Message search respects the current source, project, and date filters
- Selecting a session updates the inspector
- Searching sessions filters the table
- JSON export opens a save panel and writes a file
- CSV export opens a save panel and writes a file
- Refresh rescans and keeps the app responsive

## Real-Log Spot Check

Use local Codex history to check a large or active project:

1. Start the macOS app.
2. Select a high-volume project.
3. Confirm the session count and token totals differ from `All Projects`.
4. Select several sessions from the filtered table.
5. Confirm the inspector changes each time.
6. Confirm no error banner appears.

## Failure Triage

If the app cannot load data:

- Confirm `npm run build:native-engine` succeeds.
- Confirm the app was started from the repository root with `npm run app:mac`.
- Check whether selected custom source paths exist.
- Check whether multiple heavy scans are running.
- Re-run `npm test` and `npm run build:mac` to isolate parser or native build failures.

The private local engine caches parsed corpora briefly and shares in-flight scans, so project selection and session detail requests should not trigger repeated full reparses during normal use.
