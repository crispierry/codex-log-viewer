# Usage

## Install From Source

```sh
git clone https://github.com/crispierry/codex-log-viewer.git
cd codex-log-viewer
npm install
```

## Run The macOS App

The macOS app is the primary way to use Codex Log Viewer.

```sh
npm run app:mac
```

From the app you can:

- use the default Codex log locations
- add custom files or directories in the source panel
- select a project from the sidebar
- filter by date range
- search messages across all selected projects
- export JSON or CSV
- search sessions
- inspect session messages, token events, warnings, and unknown events

## Custom Sources

In the app source panel, add one path per line:

```sh
/Users/example/.codex/sessions
/Users/example/.codex/archived_sessions
/Users/example/Downloads/sample-session.jsonl
```

Click `Apply` to rescan those paths. Click `Default` to return to `~/.codex/sessions` and `~/.codex/archived_sessions`.

## Message Search

Use the message search panel to search across all parsed user and assistant messages. Search respects the current source, project, and date filters. Choose `All Projects` to search across every discovered project.

## Exports

Use the `JSON` and `CSV` buttons in the app toolbar. Exports respect the current source, project, and date filters.

JSON exports include session metadata such as local file paths and cwd values. Treat them as private unless you have reviewed and redacted them.

## CLI Fallback

The CLI remains available for automation:

```sh
npm run cli -- projects
npm run cli -- summary --project sample-app --since 2026-04-22 --until 2026-04-29
npm run cli -- export --format json --output usage.json --project sample-app
```

You can still pass `--path` for fixture testing:

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

You can pass multiple `--path` values.

## Current Metric Rules

- User-message counts come from `event_msg.user_message`.
- Unique user messages are trimmed, whitespace-collapsed, and lowercased.
- Token totals sum `token_count.info.last_token_usage` records.
- `token_count` events with `info: null` are ignored for token totals.
- Unknown event shapes are preserved and counted.
- Malformed JSONL lines produce parse warnings instead of aborting the scan.
