# Agent Instructions

This repository is intended to become a public, local-first Codex log parser and native macOS app. Keep changes privacy-conscious and fixture-driven.

## Project Priorities

- Treat real Codex logs as sensitive by default.
- Do not commit unsanitized local session files.
- Prefer parser and analytics correctness before app polish.
- Preserve raw events internally, but expose redacted views by default where practical.
- Keep documentation aligned with implementation decisions.

## Planned Verification

Once tooling exists, parser changes should include:

- unit tests for normalized records
- fixture tests for each supported event shape
- malformed-line handling tests
- aggregation tests for token and message metrics

Documentation-only changes do not need app tests.

## AI Worklog

- After meaningful AI-assisted work, update `docs/ai-worklog.md` before finishing.
- Include every work-directing user message from the task, verbatim when safe, so user intent remains auditable.
- Summarize Codex's response, work performed, verification, and follow-ups.
- Redact secrets, tokens, private customer data, unsanitized local paths, and raw session-log content before committing.
- Keep raw or fuller transcripts in local-only ignored locations such as `.codex/audit/` when needed.

## Native App Review Loop

- After any user-visible native macOS app change, rebuild the app and relaunch the current packaged app so the user can immediately review the change.
- When a change is documentation-only or otherwise cannot affect the running app, say that explicitly instead of relaunching.
