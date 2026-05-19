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
- add custom files or directories with the native source picker or source panel
- select a project from the sidebar
- filter by date range
- search messages across all selected projects
- filter message search by role, model, and selected session
- review repeated user prompts for the current filters
- export redacted JSON or aggregate CSV
- search sessions
- inspect session messages, token events, warnings, and unknown events

To build a packaged app from source:

```sh
npm run package:mac
open "dist/macos/Codex Log Viewer.app"
```

## Custom Sources

In the app source panel, use `Choose` to pick files or directories. You can also paste one path per line:

```sh
/Users/example/.codex/sessions
/Users/example/.codex/archived_sessions
/Users/example/Downloads/sample-session.jsonl
```

Click `Apply` to rescan typed paths. Click `Default` to return to `~/.codex/sessions` and `~/.codex/archived_sessions`. Recent custom sources and date filter choices are stored in local app settings.

## Message Search

Use the message search panel to search across parsed messages. Search respects the current source, project, date, role, model, and session filters. Choose `All Projects` to search across every discovered project.

Click `Messages I Sent` to list prompts you typed and submitted for the selected project without typing a search phrase. Generated context wrappers, such as browser state, file attachments, review metadata, and goal-resume prompts, are excluded from that view.

Selecting a search result opens its session context in the inspector. The inspector includes copy actions for the result's session id, project, and a whitespace-normalized snippet with local home paths shortened.

Keyboard shortcuts:

- `Command-R`: refresh local logs
- `Command-F`: focus message search
- `Command-Return`: run message search
- `Command-O`: choose sources
- `Command-E`: export redacted JSON
- `Command-Shift-E`: export CSV

## Exports

Use the `JSON` and `CSV` buttons in the app toolbar. Exports respect the current source, project, and date filters.

JSON exports redact local source paths and working directories by default. Treat them as private until reviewed because project names, timestamps, session IDs, and model metadata may still be sensitive.

The CLI supports explicit raw JSON for private local use:

```sh
npm run cli -- export --format json --raw --output private-usage.json
```

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
- Repeated prompts are grouped from normalized user messages and shown only for groups with more than one submission.
- Token totals sum `token_count.info.last_token_usage` records.
- `token_count` events with `info: null` are ignored for token totals.
- Unknown event shapes are preserved and counted.
- Malformed JSONL lines produce parse warnings instead of aborting the scan.
