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

## Milestone 2: Reference-Report Parity Analytics

Goal: reproduce a private reference usage report from local Codex logs without committing the source logs or private project names.

- project discovery and alias config
- message count aggregation
- unique user-message normalization
- day/hour buckets
- token totals by type
- model breakdowns
- session table data
- JSON and CSV exports

Exit criteria:

- The tool reproduces the reference seven-day report within agreed tolerance.

Status: partially complete. The analytics engine exists; private reference-report parity still needs a dedicated validation pass against local logs.

## Milestone 3: Native App MVP

Goal: make analytics explorable in the native macOS app.

- SwiftUI macOS app package
- app launch script
- private local engine startup from the app
- source path controls
- project selector
- date range selector
- JSON and CSV export buttons
- metric cards
- message search across all parsed messages
- sessions table
- session details

Exit criteria:

- A user can inspect one project and date range without using the CLI or a browser.

Status: complete for aggregate metrics, source selection, project selection, date filters, exports, message search, sessions table, and session details. Full raw payload exploration remains a post-MVP enhancement.

## Milestone 4: Native App Polish

Goal: make the normal product path feel like a polished desktop app.

- native sidebar, toolbar, tables, search, and inspector
- native file/folder picker
- app settings
- scan progress and better empty states
- project and date facets for search
- packaged app verification

Exit criteria:

- A user can launch the app and inspect/search local logs with expected macOS controls.

Status: complete for native source picking, local source/date settings, role/model/session search filters, search result session context, repeated-prompt grouping, first-pass empty states, keyboard shortcuts, retry recovery, packaged app verification, and release-critical smoke automation. Deeper VoiceOver QA, selection-navigation shortcuts, and persistent indexed search remain follow-up work.

## Milestone 5: Public Release

Goal: publish a useful open source release.

- polished README with screenshots
- install/run instructions
- fixture contribution workflow
- CI for lint/test/build
- macOS packaging and release workflow
- release notes template
- first version tag

Exit criteria:

- A new user can install, run against local logs, and understand privacy implications.

Status: source and CI readiness are complete for review. The first version tag and official notarized artifact still depend on human review, maintainer-local private reference parity, and Developer ID/notary credentials.
