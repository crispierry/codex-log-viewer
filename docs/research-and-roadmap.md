# Codex Log Viewer Research And Roadmap

Date: 2026-05-02

## Implementation Status

This document is the initial research and execution map. The repository now has a native-macOS-first v0 implementation with a TypeScript parser, analytics package, private local API engine, CLI fallback, fixtures, tests, and CI. Treat this file as historical context plus roadmap background; current usage is documented in [Usage](usage.md).

## Goal

Build an open source, local-first tool for parsing Codex session logs and showing project-level usage analytics:

- message counts by project, day, and hour
- unique user-message counts
- token usage totals and trends
- input, cached input, output, and reasoning tokens
- model and reasoning-effort breakdowns
- session, project, and time-window drilldowns

## What Already Exists

The space is active, but most tools are either token counters, CLI summaries, or transcript browsers rather than a project analytics workbench.

- [ccusage](https://github.com/ryoppippi/ccusage) and [`@ccusage/codex`](https://unpkg.com/@ccusage/codex@18.0.8/package.json) analyze Codex JSONL usage from local files and report usage/cost by day, month, and session.
- [ccstats](https://docs.rs/crate/ccstats/latest) is a Rust CLI that supports `~/.codex/sessions/`, daily/weekly/monthly/project/session views, model-level token/cost breakdowns, JSON output, and warning handling for malformed records.
- [Codex Token Usage](https://marketplace.visualstudio.com/items?itemName=hochonin93.codex-token-usage) is a VS Code extension that reads Codex session JSONL files and summarizes today/yesterday/last-7-days/month usage with input, cached, output, and reasoning breakdowns.
- [codex-token-counter](https://socket.dev/npm/package/codex-token-counter) is a Node service/dashboard that scans legacy token logs plus Codex rollout files under `~/.codex/sessions`, exposes metrics over HTTP, and includes date presets.
- [Agent Sessions](https://github.com/jazzyalex/agent-sessions) is a local-first macOS app for browsing and searching local Codex, Claude, Gemini, Copilot CLI, OpenCode, and OpenClaw sessions, with transcript and resume workflows.
- [toktrack](https://www.producthunt.com/products/toktrack) positions itself as a fast Rust CLI for spending by model/day across Claude Code, Codex CLI, Gemini CLI, and OpenCode.
- [codex-replay](https://www.reddit.com/r/codex/comments/1rn3u2n/codexreplay_interactive_html_replays_for_openai/) generates self-contained HTML replays from Codex JSONL sessions, with filtering, redaction, bookmarks, and session picking.

Opportunity: a public parser library plus native project analytics app is still a good niche. The strongest differentiator is accurate project attribution, message analytics, schema transparency, and a reusable parser others can build on.

## Official Documentation Status

OpenAI documents Codex CLI as a local, open source coding agent that can read, change, and run code in the selected directory ([Codex CLI docs](https://developers.openai.com/codex/cli)). OpenAI also documents `codex exec --json` for programmatic JSONL event output in exec mode ([exec-mode docs](https://www.mintlify.com/openai/codex/advanced/exec-mode)).

I did not find a stable official page that fully specifies the persisted `rollout-*.jsonl` session schema under `~/.codex/sessions`. GitHub issues confirm that these files are real and useful, but also that downstream consumers currently rely on the evolving JSONL shape. One openai/codex issue says Codex automatically writes per-session JSONL logs under `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` ([issue #2288](https://github.com/openai/codex/issues/2288)). Another issue proposed more precise usage fields for JSONL because tools need timestamps, token usage, model, request IDs, and reset windows for trustworthy analytics ([issue #2989](https://github.com/openai/codex/issues/2989)).

Working assumption: this project should treat the Codex rollout format as an evolving event log, not a frozen API. The parser should be tolerant, fixture-driven, version-aware where possible, and explicit about confidence/unknown fields.

## Sanitized Local Findings

The project was initially shaped by private local Codex logs and a private seven-day usage report. Those source logs and project names are intentionally not included in this public repository.

The desired analytics shape from that private validation pass is safe to describe at a high level:

- seven-day user-message submissions
- seven-day unique user-message counts
- model response counts
- total, input, cached input, fresh input, output, and reasoning token totals
- day/hour activity buckets
- model and session breakdowns

Representative Codex rollout event types seen locally:

- `session_meta`: session id, timestamp, cwd, originator, CLI version, source, model provider
- `turn_context`: turn id, cwd, current date, timezone, model, reasoning effort, sandbox and approval settings
- `event_msg.user_message`: submitted user message plus image/local image metadata
- `event_msg.agent_message`: assistant message with phase such as commentary/final answer
- `event_msg.token_count`: cumulative and last-turn token usage, model context window, rate limits
- `event_msg.task_started` and `event_msg.task_complete`: turn lifecycle and timing
- `response_item.message`: role/content records for user, developer, assistant messages
- `response_item.function_call` and `function_call_output`: tool calls and results
- `event_msg.exec_command_end`: command execution result metadata
- `event_msg.patch_apply_end`: structured patch results

Important parsing caveat: some `token_count` events have `info: null` and only carry rate-limit state, so token aggregation must ignore or separately classify these.

## MVP Scope

1. Parser library

Read `~/.codex/sessions/**/*.jsonl`, `~/.codex/archived_sessions/*.jsonl`, and explicit user-provided files/directories. Emit normalized `Session`, `Turn`, `Message`, `TokenUsage`, `ToolCall`, and `ParseWarning` records.

2. Project attribution

Use `session_meta.payload.cwd`, `turn_context.payload.cwd`, and tool execution `cwd` fields. Normalize symlinks/worktrees when possible, and allow manual project aliases so related worktrees can roll up to one project name.

3. Metrics engine

Compute message counts, unique normalized user messages, day/hour buckets in local timezone, token totals, fresh input tokens, cached input tokens, output tokens, reasoning tokens, model breakdowns, session breakdowns, and parse completeness.

4. Native macOS app

The primary surface is the native SwiftUI macOS app. First screen should be the actual analytics tool: source selector, project selector, date range, metric cards, search, sessions table, and inspector.

5. CLI fallback

Provide `codex-log-viewer summary`, `projects`, `sessions`, and `export --format json|csv` commands so the parser is useful without the UI.

6. Public repo baseline

Ship with anonymized fixtures, parser tests, README, privacy notes, schema notes, and contribution guidelines.

## Architecture Recommendation

Use TypeScript for the first version:

- `packages/parser`: JSONL reader, schema guards, normalization, fixtures
- `packages/analytics`: aggregation and bucketing logic
- `apps/macos`: native SwiftUI app using the private local API engine
- `apps/server`: private local API engine
- `apps/cli`: Node CLI using the same parser/analytics packages
- `fixtures/codex`: sanitized event fixtures covering known schema variants

This keeps the public contribution surface approachable and makes the parser reusable by the macOS app and CLI. If performance becomes a real issue after testing against thousands of sessions, we can add a Rust-backed scanner or SQLite-backed index later.

## Parsing Strategy

- Parse JSONL line by line and never fail the whole import because one line is malformed.
- Preserve raw events alongside normalized records for drilldown and debugging.
- Treat unknown event types as `UnknownEvent` with countable warnings.
- Aggregate `token_count.info.last_token_usage` for per-turn usage when present; use cumulative totals only for session reconciliation.
- De-duplicate token events cautiously. Prefer turn id plus timestamp plus last-token payload hash until request IDs become available.
- Count user messages from `event_msg.user_message` first, with `response_item.message role=user` as a fallback or audit source.
- Normalize unique messages by trimming, whitespace collapsing, and case folding, while keeping original first-seen text.
- Separate user-authored messages from injected setup/context records where possible.

## Initial Milestones

Milestone 0: repo foundation

- initialize repo, license, README, package manager, lint/test/build
- add sanitized fixtures from local logs
- document supported Codex versions and known caveats

Milestone 1: parser MVP

- parse rollout files into normalized records
- tests for `session_meta`, `turn_context`, `user_message`, `agent_message`, `token_count`, lifecycle events, and malformed lines
- CLI `summary --path <dir>`

Milestone 2: reference-report parity analytics

- reproduce a private reference report using local logs without committing the source data: messages, unique messages, day/hour buckets, total/input/cached/output/reasoning tokens, model counts
- export JSON and CSV
- add project alias config

Milestone 3: native app MVP

- native SwiftUI app
- project selector and date range
- metric cards, message search, sessions table
- session details for selected session/turn, with full raw payload exploration as a later enhancement

Milestone 4: public polish

- privacy model and redaction guidance
- sample screenshots
- fixture contribution workflow
- GitHub Actions CI
- first tagged release

## Open Questions And Follow-Ups

- Use the [Unified AI Log Provider Support](unified-ai-log-provider-support-plan.md) plan when expanding beyond Codex to Claude Code, cloud-imported transcripts, and future providers.
- Should we eventually ship a VS Code extension in addition to the native macOS app?
- Do we want to estimate API-equivalent cost, even though Codex product/subscription billing can differ?
- How aggressively should we redact message contents by default in exports?
- Should project grouping default to exact `cwd`, git root, repo name, or a user-defined alias map?

## Recommended Next Step

Continue hardening the native macOS app around a tested parser and analytics core. The next public-facing success criterion is packaging: a signed/notarized `.app` release path with clear privacy notes and no need to inspect or upload private logs.
