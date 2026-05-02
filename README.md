# Codex Log Viewer

Codex Log Viewer is a local-first parser and analytics project for OpenAI Codex session logs.

The goal is to help developers understand how they use Codex across projects: message volume, unique prompts, token usage, model usage, session history, and time-based activity patterns.

## Status

This project is in the planning and foundation stage.

The first implementation target is a parser and analytics core that can reproduce the WBD Celebration usage report from local Codex `rollout-*.jsonl` files. Once the metrics are trustworthy, the dashboard and CLI will sit on top of the same shared data layer.

## Planned Features

- Parse Codex JSONL sessions from `~/.codex/sessions` and `~/.codex/archived_sessions`
- Group sessions by project, git root, worktree, or user-defined alias
- Count messages by project, session, day, and hour
- Count unique normalized user messages
- Track total, input, cached input, fresh input, output, and reasoning tokens
- Break usage down by model, reasoning effort, source, and originator
- Export summaries as JSON and CSV
- Provide a local web dashboard with charts and raw-event inspection
- Keep all parsing and analysis local by default

## Documentation

- [Research and roadmap](docs/research-and-roadmap.md)
- [Product requirements](docs/product-requirements.md)
- [Architecture](docs/architecture.md)
- [Parser schema notes](docs/parser-schema-notes.md)
- [Privacy and redaction](docs/privacy-and-redaction.md)
- [Fixture guidelines](docs/fixture-guidelines.md)
- [Milestones](docs/milestones.md)

## Development Principles

- Local-first: session contents should not leave the user's machine by default.
- Parser-first: analytics should come from a tested, reusable parsing layer.
- Schema-tolerant: Codex logs are evolving, so unknown events should be preserved, counted, and surfaced.
- Fixture-driven: every supported event shape should have a sanitized fixture and test.
- Honest metrics: distinguish exact log-derived values from estimates or incomplete data.

## License

MIT. See [LICENSE](LICENSE).
