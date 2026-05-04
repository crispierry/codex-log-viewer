# Codex Fixtures

This directory will contain sanitized Codex JSONL fixtures for parser tests.

Do not commit real local Codex logs here. Keep fixtures small, synthetic, and privacy-safe while preserving the event shapes needed for tests.

See [Fixture Guidelines](../../docs/fixture-guidelines.md).

## Current Fixtures

- `sample-session.jsonl`: one synthetic Codex session with session metadata, turn context, user/assistant messages, token usage, a null token event, an unknown future event, and one malformed line for warning coverage.
