# UI Test Plan

## Goal

Make sure Codex Log Viewer can be used fully from the dashboard without relying on CLI workflows.

The UI must support:

- selecting log sources
- selecting projects
- filtering by date
- viewing metric cards and charts
- searching sessions
- selecting a session
- seeing session details update
- exporting JSON and CSV
- avoiding failed browser requests during normal interactions

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

### Build And Type Checks

Run:

```sh
npm run lint
```

Covers:

- TypeScript compilation for parser, analytics, server, CLI, and web app
- production dashboard build

### Browser Regression Test

Run:

```sh
npm run test:e2e
```

Covers the core dashboard workflow against a deterministic fixture:

- open dashboard
- set custom source path
- apply source
- select project
- verify project filter applies
- verify project token totals are labeled
- select session
- verify session details update
- assert no browser request failed

## Manual Dashboard Checklist

Run:

```sh
npm run serve
```

Open [http://127.0.0.1:3210](http://127.0.0.1:3210).

Check:

- Page loads without `Failed to fetch`
- Project list appears
- Project totals show a `tokens` label
- Selecting a project changes metric cards and session list
- Selecting `All Projects` restores all-project totals
- Changing date filters clears stale session selection and reloads metrics
- Selecting a session updates the Session Details panel
- Searching sessions filters the table
- JSON export downloads
- CSV export downloads
- Refresh rescans and keeps the server responsive

## Real-Log Spot Check

Use local Codex history to check a large project:

1. Start the dashboard.
2. Select `WBD-Celebration` or another high-volume project.
3. Confirm the session count and token totals differ from `All Projects`.
4. Select several sessions from the filtered table.
5. Confirm the Session Details panel changes each time.
6. Confirm no `Failed to fetch` banner appears.

## Failure Triage

If the dashboard shows `Failed to fetch`:

- Confirm the local server is running on `127.0.0.1:3210`.
- Check `/api/health`.
- Check whether multiple heavy scans are running.
- Re-run `npm run test:e2e` to reproduce the browser failure.
- Inspect `/tmp/codex-log-viewer-serve.log` when running through the local helper.

The server caches parsed corpora briefly and shares in-flight scans, so project selection and session detail requests should not trigger repeated full reparses during normal use.
