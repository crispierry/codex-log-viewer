# 0002: Dashboard-First Product Workflow

Date: 2026-05-04

## Status

Accepted

## Context

The project started with both CLI and dashboard capabilities. The desired user experience is now explicit: users should not need the CLI for normal use. They should be able to select sources, projects, date ranges, exports, sessions, and session details from the front end.

## Decision

Codex Log Viewer is dashboard-first.

The CLI remains available for automation, fixture smoke tests, and debugging, but product documentation and UX should lead with the local web dashboard.

## Consequences

- README and usage docs start with `npm run serve`.
- New user-facing capabilities should be exposed in the dashboard before being considered complete.
- Server APIs should support dashboard workflows directly.
- CLI-only features are acceptable for maintenance utilities, but not for core product workflows.
