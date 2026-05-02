# Agent Instructions

This repository is intended to become a public, local-first Codex log parser and dashboard. Keep changes privacy-conscious and fixture-driven.

## Project Priorities

- Treat real Codex logs as sensitive by default.
- Do not commit unsanitized local session files.
- Prefer parser and analytics correctness before dashboard polish.
- Preserve raw events internally, but expose redacted views by default where practical.
- Keep documentation aligned with implementation decisions.

## Planned Verification

Once tooling exists, parser changes should include:

- unit tests for normalized records
- fixture tests for each supported event shape
- malformed-line handling tests
- aggregation tests for token and message metrics

Documentation-only changes do not need app tests.
