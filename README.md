# Codex Log Viewer

Codex Log Viewer is a local-first native macOS app and parser for OpenAI Codex session logs.

The goal is to help developers understand how they use Codex across projects: message volume, unique and repeated prompts, token usage, model usage, session history, and time-based activity patterns.

## Status

This project has a working v0 implementation:

- TypeScript parser for Codex `rollout-*.jsonl` logs
- Shared analytics engine
- CLI summaries and exports
- Private local API engine for the app
- Native SwiftUI macOS app
- Cross-project message search
- Sanitized fixtures and tests
- GitHub Actions CI

## Current Capabilities

- Parse Codex JSONL sessions from `~/.codex/sessions` and `~/.codex/archived_sessions`
- Group sessions by project path and Codex worktree name
- Count messages by project, session, day, and hour
- Count unique normalized user messages
- Group repeated user prompts for the current filters
- Track total, input, cached input, fresh input, output, and reasoning tokens
- Break usage down by model
- Export summaries as JSON and CSV
- Provide a macOS app with metrics, search, and session tables
- Keep all parsing and analysis local by default

## Quick Start

For development:

```sh
npm install
npm run app:mac
```

The macOS app starts a private local parser engine on an app-owned `127.0.0.1` port, protects it with an ephemeral bearer token, and opens the desktop window.

To build a local `.app` bundle:

```sh
npm run package:mac
open "dist/macos/Codex Log Viewer.app"
```

## macOS App

The app is the primary product experience. From the desktop UI you can:

- scan default Codex logs
- add custom files or directories from the native `Logs` menu
- select projects or all projects
- browse projects, sessions, sent messages, and Codex interactions in a four-column native layout
- switch between Browse, Overview, and Search sections for the selected project
- filter by all time, day, week, month, year, or custom date range from the workspace header
- search messages across projects
- list the prompts you typed and submitted for the selected project
- select a sent prompt and inspect the related Codex response, tool activity, context, tokens, and timing in organized native sections
- filter message search by role, model, session, project, source, and date range
- review repeated prompts for the current filters
- refresh the scan
- export redacted JSON or aggregate CSV
- inspect session messages, turns, tokens, warnings, and unknown events, with file-scoped handling for copied logs that reuse a session id

Run it with:

```sh
npm run app:mac
```

The macOS app is native SwiftUI. It reuses the local parser, analytics, and private API engine so parsing stays fixture-driven and local.

Packaged releases bundle the local engine and a known Node runtime so end users do not need to run a terminal setup. Source builds still require Node and Swift tooling.

## CLI

The CLI remains available for automation and smoke tests, but it is not required for normal use.

```sh
npm run cli -- projects
npm run cli -- summary --project sample-app --since 2026-04-22 --until 2026-04-29
npm run cli -- export --format csv --output usage.csv --project sample-app
npm run cli -- export --format json --output usage.json --project sample-app
```

Use `--path <file-or-dir>` to scan a specific fixture, export, or alternate Codex home:

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

If a future CLI package is published, the intended binary name is:

```sh
codex-log-viewer summary
```

JSON exports are redacted by default. Use `--raw` only for local private exports you have reviewed:

```sh
npm run cli -- export --format json --raw --output private-usage.json
```

## Verification

```sh
npm run privacy:scan
npm run lint
npm test
npm run build
npm run check:mac-accessibility
npm run build:mac # macOS only
npm run package:mac # macOS only
npm run smoke:mac-package # macOS only
npm run smoke:mac-ui # macOS only
npm run release:mac # macOS only, package plus smoke tests
npm run benchmark:search
npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app
```

## Documentation

- [Research and roadmap](docs/research-and-roadmap.md)
- [macOS app and open source plan](docs/macos-app-plan.md)
- [First public release plan](docs/first-public-release-plan.md)
- [Open source readiness](docs/open-source-readiness.md)
- [Release checklist](docs/release-checklist.md)
- [Release notes template](docs/release-notes-template.md)
- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Parser schema notes](docs/parser-schema-notes.md)
- [Privacy and redaction](docs/privacy-and-redaction.md)
- [Performance notes](docs/performance.md)
- [Fixture guidelines](docs/fixture-guidelines.md)
- [Milestones](docs/milestones.md)
- [Usage](docs/usage.md)
- [UI test plan](docs/ui-test-plan.md)

## Development Principles

- Local-first: session contents should not leave the user's machine by default.
- Parser-first: analytics should come from a tested, reusable parsing layer.
- Schema-tolerant: Codex logs are evolving, so unknown events should be preserved, counted, and surfaced.
- Fixture-driven: every supported event shape should have a sanitized fixture and test.
- Honest metrics: distinguish exact log-derived values from estimates or incomplete data.

## Privacy

Codex logs may contain prompts, source code, file paths, terminal output, and secrets. The default workflow is local-only. Do not commit unsanitized logs or paste private sessions into public issues.

Default JSON exports redact local source paths and working directories. Treat exports as private until you review them because project names, timestamps, session IDs, and aggregate metadata may still be sensitive. Raw JSON exports are explicitly private and should not be attached to public issues.

See [Privacy and Redaction](docs/privacy-and-redaction.md).

## License

MIT. See [LICENSE](LICENSE).
