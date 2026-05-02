# Fixture Guidelines

Fixtures are the backbone of parser confidence. They let contributors add support for new Codex event shapes without sharing private session history.

## Directory Plan

```text
fixtures/
  codex/
    README.md
    session-meta.jsonl
    turn-with-token-count.jsonl
    malformed-line.jsonl
```

## Rules

- Use small, focused fixtures.
- Prefer one behavior per fixture.
- Preserve exact JSONL structure.
- Include malformed lines only in fixtures specifically testing malformed input.
- Do not include secrets, private code, private URLs, or proprietary content.
- Keep timestamps realistic but non-sensitive.
- Use stable fake paths such as `/Users/example/projects/sample-app`.

## Good Fixture Names

- `session-meta.jsonl`
- `user-message.jsonl`
- `token-count-null-info.jsonl`
- `turn-context-model.jsonl`
- `exec-command-end.jsonl`
- `unknown-event.jsonl`

## Review Checklist

- Does this fixture test a parser behavior?
- Is every line safe to publish?
- Are field names and nesting preserved?
- Is the file small enough to understand quickly?
- Does documentation mention the event shape if it is new?
