# Product Requirements

## Product Thesis

Codex Log Viewer helps developers understand their local Codex usage without uploading session history to a third-party service.

The product should answer:

- How much did I use Codex on this project?
- When did the work happen?
- How many messages did I send?
- Which messages were repeated?
- How many tokens were used, and where did they go?
- Which models and reasoning settings were used?
- Which sessions or turns drove unusual usage?

## Primary Users

- Individual developers using Codex locally
- Engineering leads who want local project-level visibility
- Open source maintainers curious about agent-assisted maintenance patterns
- Researchers studying coding-agent workflows from sanitized local logs

## Jobs To Be Done

1. As a developer, I want to select a project and date range so I can understand my Codex activity for that work.
2. As a developer, I want to see messages by day and hour so I can understand work rhythm and session intensity.
3. As a developer, I want token usage by model and type so I can understand usage drivers.
4. As a maintainer, I want sanitized fixtures so parser behavior can improve without leaking private logs.
5. As a contributor, I want clear schema notes so I can add support for new Codex event shapes.

## MVP Requirements

- [x] Discover session logs from `~/.codex/sessions`, `~/.codex/archived_sessions`, and user-provided paths
- [x] Parse JSONL line by line with malformed-line warnings
- [x] Normalize session metadata, turns, messages, token usage, task timing, and raw unknown events
- [x] Group sessions by project path and Codex worktree name
- [x] Calculate message counts and unique user-message counts
- [x] Calculate day and hour buckets
- [x] Calculate total, input, cached input, fresh input, output, and reasoning tokens
- [x] Break metrics down by model and session
- [x] Export JSON and CSV summaries
- [x] Render a local dashboard from the same analytics layer
- [x] Select data sources, projects, date ranges, exports, and sessions from the front end
- [x] Inspect session details from the front end

## Post-MVP Enhancements

- Git-root based grouping
- User-defined alias configuration file
- Full raw event payload explorer in the dashboard
- Redacted detailed export mode
- API-equivalent cost estimates
- Persistent local cache for very large histories

## Non-Goals For MVP

- Remote hosted analytics
- Team account management
- Automatic upload or sharing of logs
- Perfect billing reconciliation with Codex subscription limits
- Supporting every AI coding tool on day one
- Editing or replaying sessions

## Success Criteria

- Reproduce the WBD Celebration seven-day usage report within an agreed tolerance
- Parse known local Codex rollout variants without crashing
- Surface unknown or incomplete data clearly
- Provide a usable project/date range dashboard
- Keep all default workflows local

## Risks

- Codex rollout schema may change without a formal versioned contract
- Token events may be cumulative, missing, null, or duplicated depending on session shape
- User messages can include injected setup text, pasted context, or app-generated content
- Project attribution can be ambiguous across worktrees and copied repos
- Public fixtures can accidentally leak sensitive content if guidelines are weak

## Product Decisions

- The dashboard is the primary product workflow.
- The CLI remains as an automation and debugging fallback.
- Project grouping currently defaults to project path/Codex worktree name.
- Session details are visible after explicit session selection.
- Full raw payload exploration, redacted detailed exports, API-equivalent cost estimates, and git-root grouping are post-MVP enhancements.
