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
- add custom files or directories from the native `Logs` menu
- select a project from the sidebar
- use Browse to move from project to submitted message to Codex interaction, with sessions available as an optional view
- use Overview for metrics, charts, and Project Focus prompt categories for the selected project
- use Search for cross-project or project-filtered message search
- use Audit to generate, review, smart-merge, and approve `docs/ai-worklog.md`
- filter by all time, day, week, month, year, or a custom date range from the workspace header
- search messages across all selected projects
- filter message search by role, model, and selected session
- review repeated user prompts for the current filters
- export redacted JSON or aggregate CSV
- inspect session messages, token events, warnings, and unknown events
- use `Help > Codex Log Viewer Help` for a quick native guide and `Help > Open Usage Guide` for the full usage document

To build a packaged app from source:

```sh
npm run package:mac
open "dist/macos/Codex Log Viewer.app"
```

## Custom Sources

Use `Logs > Choose Codex Log Location...` to pick custom Codex log files or folders. Use `Logs > Use Default Codex Log Locations` to return to `~/.codex/sessions` and `~/.codex/archived_sessions`. Recent custom sources and date filter choices are stored in local app settings.

The date filter lives in the workspace header. Use the calendar control to switch between all time, a specific day, week, month, year, or a custom start/end range. Future dates are disabled, and the current week, month, or year is capped at today.

## Message Search

Use the Search section to search across parsed messages. Search respects the current source, project, date, role, model, and session filters. Choose `All Projects` to search across every discovered project.

Browse lists prompts you typed and submitted for the selected project without requiring a session first. Generated context wrappers, such as browser state, file attachments, review metadata, and goal-resume prompts, are excluded from that view.

In Browse, the sidebar selects the project, the main Messages column lists submitted prompts for the current project and date filters, and the Codex Interaction column shows the selected message split into user message, Codex response, tool activity, system/developer context, and token/timing sections. User messages show their Project Focus category label anywhere they appear. Use `View > Show Sessions` when you want an extra session column before the message list.

Use `View > Operational Messages` to hide or show all operational prompt families at once, or control families independently: `Code review`, `Git commands`, `Plan approvals`, and `Run app`. The same operational filters apply in Browse, optional session-message lists, Search results, and repeated prompts.

The native macOS tab bar is hidden while there is only one viewer tab. Use `File > New Tab` when you want another app tab; each tab keeps its own project, date, filter, search, and selection state, and the tab bar appears once multiple tabs are open.

Search results include the same Project Focus category labels as Browse. Select a search result to copy its session id, project, or a whitespace-normalized snippet with local home paths shortened. Use `Show Conversation` to jump from the result into Browse.

Keyboard shortcuts:

- `Command-R`: refresh local logs incrementally
- `Command-Shift-R`: rebuild the local parsed cache
- `Command-F`: focus message search
- `Command-Return`: run message search
- `Command-O`: choose sources
- `Command-E`: export redacted JSON
- `Command-Shift-E`: export CSV

## Local Cache

The macOS app stores a private parsed-session cache in `~/Library/Application Support/Codex Log Viewer/Cache/v1` so it does not need to reprocess unchanged logs every time you navigate or relaunch the app.

Refresh checks for added, changed, or deleted session files and updates only what changed. Use `Logs > Rebuild Local Cache` if the cache ever looks stale or you want to force a full local reparse.

## Exports

Use `Logs > Export Redacted JSON...` or `Logs > Export CSV...`. Exports respect the current source, project, and date filters.

JSON exports redact local source paths and working directories by default. Treat them as private until reviewed because project names, timestamps, session IDs, and model metadata may still be sensitive.

The CLI supports explicit raw JSON for private local use:

```sh
npm run cli -- export --format json --raw --output private-usage.json
```

## AI Audit Worklogs

Use the Audit section in the macOS app to generate a smart-merged Markdown preview, edit the reviewed text, and approve the write to `docs/ai-worklog.md`.

The CLI remains available for fixture tests and automation:

```sh
npm run cli -- audit --repo /path/to/repo --output /path/to/repo/docs/ai-worklog.md
```

The audit flow includes every submitted user message it finds for the repository and, by default, the captured Codex responses that followed those messages. Output uses public privacy mode unless `--raw` is passed in the CLI, redacting obvious local home paths, email addresses, and token-like strings while preserving user intent.

Smart merge mode skips generated sections already present in the target worklog and appends only new generated session sections. Existing reviewed text is preserved.

Use raw mode only for private local review:

```sh
npm run cli -- audit --repo /path/to/repo --raw --output .codex/audit/raw-ai-worklog.md
```

Use `--no-responses` when the audit should store only the user-intent trail.

## CLI Fallback

The CLI remains available for automation:

```sh
npm run cli -- projects
npm run cli -- summary --project sample-app --since 2026-04-22 --until 2026-04-29
npm run cli -- export --format json --output usage.json --project sample-app
npm run cli -- audit --repo /path/to/repo --output /path/to/repo/docs/ai-worklog.md
```

You can still pass `--path` for fixture testing:

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

You can pass multiple `--path` values.

## Current Metric Rules

- User-message counts come from `event_msg.user_message`.
- Unique user messages are trimmed, whitespace-collapsed, and lowercased.
- Project Focus classifies submitted user messages into deterministic local categories such as `Feature design`, `Implementation`, `Bug fixes`, `Git commands`, `Deploy/release`, `Planning/strategy`, `Research`, `Content creation`, `Data/metrics`, `Documentation`, and `Feedback/context`.
- Project Focus percentages are based on the current project and date filters, with representative examples shown only inside the local app or non-redacted exports.
- Repeated prompts are still grouped from normalized user messages in the analytics API and shown only for groups with more than one submission.
- Short approvals such as `yes`, `go ahead`, `execute`, `do that`, or `sounds good` are grouped as `Plan approvals`.
- Short Git workflow requests such as commit, push, publish, deploy to production, branch, PR, worktree, or repo-cleanliness checks are grouped as `Git commands`.
- Short app launch requests such as run, start, restart, launch, or open the app/server are grouped as `Run app`.
- Short review requests such as `do a code review`, `review the diff`, or `inspect the changes` are grouped as `Code review`.
- Browse, Search, and operational prompt groups can hide or show grouped prompt families from the `View > Operational Messages` menu.
- Token totals sum `token_count.info.last_token_usage` records.
- `token_count` events with `info: null` are ignored for token totals.
- Unknown event shapes are preserved and counted.
- Malformed JSONL lines produce parse warnings instead of aborting the scan.
