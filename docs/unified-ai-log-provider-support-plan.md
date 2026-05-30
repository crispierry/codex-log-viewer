# Unified AI Log Provider Support

Date: 2026-05-29
Status: Planned

## Summary

Support Claude Code and future AI-agent logs through a provider adapter framework instead of folding every source into the current Codex-specific parser.

Claude Code is a strong first non-Codex provider because its local sessions are JSONL files under `~/.claude/projects/`. Those records can be normalized into the viewer's existing concepts: sessions, messages, tool activity, model usage, token usage, warnings, and unknown events.

The product should become a unified AI log viewer in behavior: one project/session/message experience with provider filters and source labels. Cloud-backed material should enter through explicit local imports or future connectors, not silent authenticated scraping.

Relevant Claude Code documentation:

- [Sessions](https://code.claude.com/docs/en/sessions)
- [Claude directory](https://code.claude.com/docs/en/claude-directory)
- [Remote Control](https://code.claude.com/docs/en/remote-control)
- [Claude Code on the web](https://code.claude.com/docs/en/web-quickstart)

## Key Changes

- Add a provider adapter layer:
  - Add `provider: "codex" | "claude" | string` to normalized sessions, turns, messages, token usage, tool events, warnings, and unknown events.
  - Keep the current Codex parser as the `codex` adapter.
  - Add a Claude adapter for local `~/.claude/projects/**/*.jsonl` transcripts.
  - Keep compatibility exports such as `parseCodexCorpus`, while adding generic `parseLogCorpus` APIs.
- Normalize Claude Code records:
  - Top-level `user` records with `message.content` become submitted user messages.
  - Top-level `assistant` records become assistant messages, with text extracted from Anthropic content blocks.
  - `tool_use` and `tool_result` content blocks become tool events.
  - Claude `message.usage` maps into token usage, including separate cache creation and cache read fields.
  - `system`, `attachment`, `queue-operation`, title, and future records are preserved as provider events or unknown events.
- Extend discovery:
  - Default local discovery scans Codex and Claude local roots.
  - User-selected files/directories can contain mixed providers.
  - Cloud sessions are supported as explicit imported/exported local files until a real connector exists.
- Update analytics and API:
  - Add provider filters to projects, summaries, sessions, search, exports, and audit endpoints.
  - Add provider breakdowns without breaking project, model, date, repeated-prompt, and search workflows.
  - Keep audit-worklog generation conservative until provider-specific response reconstruction is tested.
- Update the macOS app:
  - Present mixed data as unified AI logs.
  - Add provider badges and a provider filter: All, Codex, Claude.
  - Rename mixed-provider surfaces from "Codex Interaction" to "AI Interaction".
  - Keep repository and package names unchanged for this milestone.
- Update documentation:
  - Add an architecture decision record for provider adapters and cloud-import boundaries.
  - Add `fixtures/claude` fixture guidance.
  - Update architecture, usage, privacy/redaction, parser schema notes, README, and this worklog as implementation progresses.

## Test Plan

- Confirm worktree bootstrap before running repo-local tooling.
- Add sanitized Claude fixtures for user messages, assistant text, usage, tool use/result, attachment records, queue operations, system hook records, title records, and malformed lines.
- Add mixed-corpus tests proving Codex and Claude can be parsed together, filtered by provider, grouped by project, searched, and summarized.
- Add token tests covering Claude cache creation and cache read tokens separately.
- Add server/API tests for provider filters and mixed source paths.
- Add macOS decoding and interaction reconstruction smoke coverage with sanitized mixed-provider fixtures.
- Run `npm test`, `npm run build`, `npm run privacy:scan`, and macOS smoke checks for user-visible UI changes.

## Assumptions

- The first implementation remains local-first and fixture-driven.
- No raw local Claude or Codex transcripts are committed.
- Cloud support means imported/exported cloud transcripts or future session-store adapters, not logging into hosted Claude services from the app.
- The product experience becomes a unified AI log viewer, but a repository or package rename is deferred.
