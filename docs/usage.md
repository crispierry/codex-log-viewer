# Usage

## Install From Source

```sh
git clone https://github.com/crispierry/codex-log-viewer.git
cd codex-log-viewer
npm install
```

## Run The Dashboard

The front end is the primary way to use Codex Log Viewer.

```sh
npm run serve
```

Then open [http://127.0.0.1:3210](http://127.0.0.1:3210).

From the dashboard you can:

- use the default Codex log locations
- add custom files or directories in the source panel
- select a project from the sidebar
- filter by date range
- export JSON or CSV
- search sessions
- inspect session messages, token events, warnings, and unknown events

## Custom Sources

In the dashboard source panel, add one path per line:

```sh
/Users/example/.codex/sessions
/Users/example/.codex/archived_sessions
/Users/example/Downloads/sample-session.jsonl
```

Click `Apply` to rescan those paths. Click `Default` to return to `~/.codex/sessions` and `~/.codex/archived_sessions`.

## Exports

Use the `JSON` and `CSV` buttons in the dashboard toolbar. Exports respect the current source, project, and date filters.

## CLI Fallback

The CLI remains available for automation:

```sh
npm run cli -- projects
npm run cli -- summary --project WBD-Celebration --since 2026-04-22 --until 2026-04-29
npm run cli -- export --format json --output usage.json --project WBD-Celebration
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
