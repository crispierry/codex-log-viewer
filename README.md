# Codex Log Viewer

Codex Log Viewer is a local-first parser and analytics project for OpenAI Codex session logs.

The goal is to help developers understand how they use Codex across projects: message volume, unique prompts, token usage, model usage, session history, and time-based activity patterns.

## Status

This project has a working v0 implementation:

- TypeScript parser for Codex `rollout-*.jsonl` logs
- Shared analytics engine
- CLI summaries and exports
- Local dashboard server
- React dashboard
- Sanitized fixtures and tests
- GitHub Actions CI

## Planned Features

- Parse Codex JSONL sessions from `~/.codex/sessions` and `~/.codex/archived_sessions`
- Group sessions by project path and Codex worktree name
- Count messages by project, session, day, and hour
- Count unique normalized user messages
- Track total, input, cached input, fresh input, output, and reasoning tokens
- Break usage down by model
- Export summaries as JSON and CSV
- Provide a local web dashboard with charts and session tables
- Keep all parsing and analysis local by default

## Quick Start

```sh
npm install
npm run serve
```

The dashboard server starts on [http://127.0.0.1:3210](http://127.0.0.1:3210) by default.

## Dashboard

The dashboard is the primary product experience. From the front end you can:

- scan default Codex logs
- add custom files or directories
- select projects
- filter by date range
- refresh the scan
- export JSON or CSV
- search sessions
- inspect session messages, turns, tokens, warnings, and unknown events

Run it with:

```sh
npm run serve
```

The dashboard is served by a local Node process. Browser code does not directly access your filesystem; it calls the local API provided by the server.

For dashboard frontend development:

```sh
npm run start -w @codex-log-viewer/server
npm run dev -w @codex-log-viewer/web
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3210`.

## CLI

The CLI remains available for automation and smoke tests, but it is not required for normal use.

```sh
npm run cli -- projects
npm run cli -- summary --project WBD-Celebration --since 2026-04-22 --until 2026-04-29
npm run cli -- export --format csv --output usage.csv --project WBD-Celebration
```

Use `--path <file-or-dir>` to scan a specific fixture, export, or alternate Codex home:

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

After installing from a future package release, the intended binary name is:

```sh
codex-log-viewer summary
```

## Verification

```sh
npm run lint
npm test
npm run build
```

## Documentation

- [Research and roadmap](docs/research-and-roadmap.md)
- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Parser schema notes](docs/parser-schema-notes.md)
- [Privacy and redaction](docs/privacy-and-redaction.md)
- [Fixture guidelines](docs/fixture-guidelines.md)
- [Milestones](docs/milestones.md)
- [Usage](docs/usage.md)

## Development Principles

- Local-first: session contents should not leave the user's machine by default.
- Parser-first: analytics should come from a tested, reusable parsing layer.
- Schema-tolerant: Codex logs are evolving, so unknown events should be preserved, counted, and surfaced.
- Fixture-driven: every supported event shape should have a sanitized fixture and test.
- Honest metrics: distinguish exact log-derived values from estimates or incomplete data.

## Privacy

Codex logs may contain prompts, source code, file paths, terminal output, and secrets. The default workflow is local-only. Do not commit unsanitized logs or paste private sessions into public issues.

See [Privacy and Redaction](docs/privacy-and-redaction.md).

## License

MIT. See [LICENSE](LICENSE).
