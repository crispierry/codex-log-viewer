# Privacy And Redaction

Codex session logs are sensitive. They may contain prompts, code, file paths, command output, screenshots, local image paths, diffs, credentials, cookies, API keys, and private business context.

## Default Privacy Stance

- Parse locally by default.
- Do not upload logs.
- Do not include raw logs in GitHub issues.
- Do not commit unsanitized fixtures.
- Treat unknown fields as sensitive.

## Redaction Targets

Fixtures, screenshots, and exported examples should remove or replace:

- API keys and tokens
- passwords and cookies
- private URLs
- email addresses and phone numbers
- proprietary source code
- private customer, client, or project names
- full local home-directory paths where not needed
- terminal output containing secrets
- private document text copied into prompts

## Fixture Redaction Pattern

Keep event shape intact while replacing sensitive values:

```json
{"timestamp":"2026-04-27T19:01:00.746Z","type":"event_msg","payload":{"type":"user_message","message":"Create a test for the sample parser\n","images":[],"local_images":[],"text_elements":[]}}
```

Do not replace field names or remove nesting just to sanitize content. The parser needs realistic structure.

## Dashboard Privacy

The dashboard makes session details separate from aggregate metrics. It currently shows parsed message content and parser diagnostics when a user selects a session, so users should treat the dashboard as a local private view.

Future UI work should consider:

- collapsed full raw payloads by default
- redacted export mode by default
- clear labels when message content or raw payloads are visible
- warnings before exporting transcripts or detailed session content

## Exports

Current exports are aggregate summary exports and respect the active source, project, and date filters.

Future export modes should include:

- aggregate-only export
- redacted detail export
- raw local export

Raw local export should be explicit and clearly labeled.
