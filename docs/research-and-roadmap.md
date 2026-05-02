# Codex Log Viewer Research And Roadmap

Date: 2026-05-02

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

Opportunity: a public parser library plus visual project analytics dashboard is still a good niche. The strongest differentiator is accurate project attribution, message analytics, schema transparency, and a reusable parser others can build on.

## Official Documentation Status

OpenAI documents Codex CLI as a local, open source coding agent that can read, change, and run code in the selected directory ([Codex CLI docs](https://developers.openai.com/codex/cli)). OpenAI also documents `codex exec --json` for programmatic JSONL event output in exec mode ([exec-mode docs](https://www.mintlify.com/openai/codex/advanced/exec-mode)).

I did not find a stable official page that fully specifies the persisted `rollout-*.jsonl` session schema under `~/.codex/sessions`. GitHub issues confirm that these files are real and useful, but also that downstream consumers currently rely on the evolving JSONL shape. One openai/codex issue says Codex automatically writes per-session JSONL logs under `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl` ([issue #2288](https://github.com/openai/codex/issues/2288)). Another issue proposed more precise usage fields for JSONL because tools need timestamps, token usage, model, request IDs, and reset windows for trustworthy analytics ([issue #2989](https://github.com/openai/codex/issues/2989)).

Working assumption: this project should treat the Codex rollout format as an evolving event log, not a frozen API. The parser should be tolerant, fixture-driven, version-aware where possible, and explicit about confidence/unknown fields.

## Local Findings

Local environment checked:

- Codex CLI: `0.128.0-alpha.1`
- Total local rollout files found: `442`
- WBD Celebration related rollout files found: `218`
- WBD Celebration models observed in `turn_context`: `gpt-5.5` and `gpt-5.4`

The previous WBD report at `/Users/cris/Documents/github/WBD-Celebration/docs/usage/README.md` confirms the desired analytics shape:

- seven-day user-message submissions: `1,393`
- seven-day unique user-role messages: `1,041`
- seven-day user-message tokens: `83,659`
- model responses: `1,105`
- total model tokens: `87,546,478`
- input tokens: `87,317,753`
- cached input tokens: `82,336,000`
- fresh input tokens: `4,981,753`
- output tokens: `228,725`
- reasoning tokens: `95,769`

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

Use `session_meta.payload.cwd`, `turn_context.payload.cwd`, and tool execution `cwd` fields. Normalize symlinks/worktrees when possible, and allow manual project aliases such as all WBD worktrees rolling up to `WBD-Celebration`.

3. Metrics engine

Compute message counts, unique normalized user messages, day/hour buckets in local timezone, token totals, fresh input tokens, cached input tokens, output tokens, reasoning tokens, model breakdowns, session breakdowns, and parse completeness.

4. Dashboard

Start with a local web UI. First screen should be the actual analytics tool: project selector, date range, metric cards, day/hour charts, model breakdown, sessions table, and raw-event drilldown.

5. CLI

Provide `codex-log-viewer summary`, `projects`, `sessions`, and `export --format json|csv` commands so the parser is useful without the UI.

6. Public repo baseline

Ship with anonymized fixtures, parser tests, README, privacy notes, schema notes, and contribution guidelines.

## Architecture Recommendation

Use TypeScript for the first version:

- `packages/parser`: JSONL reader, schema guards, normalization, fixtures
- `packages/analytics`: aggregation and bucketing logic
- `apps/web`: Vite/React dashboard
- `apps/cli`: Node CLI using the same parser/analytics packages
- `fixtures/codex`: sanitized event fixtures covering known schema variants

This keeps the public contribution surface approachable and makes the parser reusable by both CLI and dashboard. If performance becomes a real issue after testing against thousands of sessions, we can add a Rust-backed scanner later.

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

Milestone 2: WBD parity analytics

- reproduce WBD metrics: messages, unique messages, day/hour buckets, total/input/cached/output/reasoning tokens, model counts
- export JSON and CSV
- add project alias config

Milestone 3: dashboard MVP

- local Vite dashboard
- project selector and date range
- metric cards, day/hour charts, model chart, sessions table
- raw event inspector for selected session/turn

Milestone 4: public polish

- privacy model and redaction guidance
- sample screenshots
- fixture contribution workflow
- GitHub Actions CI
- first tagged release

## Open Questions

- Should the tool focus only on Codex at first, or design the data model to support Claude/Gemini later?
- Should we ship as a local web app, a desktop app, a VS Code extension, or CLI-first with dashboard optional?
- Do we want to estimate API-equivalent cost, even though Codex product/subscription billing can differ?
- How aggressively should we redact message contents by default in exports?
- Should project grouping default to exact `cwd`, git root, repo name, or a user-defined alias map?

## Recommended Next Step

Start with a TypeScript monorepo and build the parser/analytics core before UI. The first success criterion should be reproducing the WBD seven-day dashboard numbers from local Codex logs with a command like:

```sh
codex-log-viewer summary --project WBD-Celebration --since 2026-04-22 --until 2026-04-29
```

Once that matches, the dashboard becomes a visualization layer over trusted data rather than a pretty wrapper around uncertain parsing.
