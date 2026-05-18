# 0001: Project Shape

Date: 2026-05-02

## Status

Accepted, amended by [0004: Native macOS App](0004-native-macos-app.md)

## Context

Codex Log Viewer needs to support a parser, analytics engine, native macOS app, private local API engine, and CLI. The parser should be reusable and tested against sanitized fixtures.

## Decision

Start as a TypeScript monorepo with separate parser, analytics, CLI, and local API packages. The native macOS app lives in the same repository and reuses the local API engine.

## Consequences

- The same parser can power the native app and CLI.
- Contributors can work on parser behavior without understanding the UI.
- The first version will favor approachability over maximum scanner performance.
- A Rust scanner can be added later if large histories require it.
