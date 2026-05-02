# 0001: Project Shape

Date: 2026-05-02

## Status

Proposed

## Context

Codex Log Viewer needs to support a parser, analytics engine, CLI, and dashboard. The parser should be reusable and tested against sanitized fixtures.

## Decision

Start as a TypeScript monorepo with separate parser, analytics, CLI, and web app packages.

## Consequences

- The same parser can power CLI and dashboard.
- Contributors can work on parser behavior without understanding the UI.
- The first version will favor approachability over maximum scanner performance.
- A Rust scanner can be added later if large histories require it.
