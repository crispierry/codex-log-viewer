# Milestones

## Milestone 0: Project Foundation

Goal: make the repository ready for public development.

- Git repository initialized
- README, license, contributing, security, and conduct docs
- GitHub issue and pull request templates
- Product, architecture, parser, privacy, fixture, and roadmap docs
- Initial sanitized fixture directory

Exit criteria:

- A contributor can understand the goal, privacy posture, and first implementation path from docs alone.

Status: complete.

## Milestone 1: Parser MVP

Goal: parse Codex rollout files into normalized records.

- TypeScript workspace scaffold
- JSONL line reader
- `session_meta` parser
- `turn_context` parser
- `event_msg.user_message` parser
- `event_msg.agent_message` parser
- `event_msg.token_count` parser
- task lifecycle parser
- unknown-event preservation
- malformed-line warnings
- fixture tests

Exit criteria:

- `summary` can scan a directory and report sessions, known events, unknown events, and parse warnings.

Status: complete for the first supported event set.

## Milestone 2: WBD Parity Analytics

Goal: reproduce the WBD Celebration metrics from local Codex logs.

- project discovery and alias config
- message count aggregation
- unique user-message normalization
- day/hour buckets
- token totals by type
- model breakdowns
- session table data
- JSON and CSV exports

Exit criteria:

- The tool reproduces the WBD seven-day report within agreed tolerance.

Status: partially complete. The analytics engine exists; WBD parity still needs a dedicated validation pass against local logs.

## Milestone 3: Dashboard MVP

Goal: make analytics explorable visually.

- local Vite/React app
- project selector
- date range selector
- metric cards
- messages by day/hour charts
- token usage charts
- model breakdown
- sessions table
- raw event inspector

Exit criteria:

- A user can inspect one project and date range without using the CLI.

Status: complete for aggregate metrics, charts, model breakdown, and sessions table. Raw event inspection remains a post-MVP enhancement.

## Milestone 4: Public Release

Goal: publish a useful open source release.

- polished README with screenshots
- install/run instructions
- fixture contribution workflow
- CI for lint/test/build
- release notes
- first version tag

Exit criteria:

- A new user can install, run against local logs, and understand privacy implications.
