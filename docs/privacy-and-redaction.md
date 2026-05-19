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

## App Privacy

The app makes session details separate from aggregate metrics. It currently shows parsed message content and parser diagnostics when a user selects a session, so users should treat the app as a local private view.

The local API is bound to loopback and protected with an ephemeral app-generated token. The token is passed only to the app-owned parser engine and is not written to logs or the UI.

Future UI work should consider:

- collapsed full raw payloads by default
- clear labels when message content or raw payloads are visible
- warnings before exporting transcripts or detailed session content

## Exports

Current exports respect the active source, project, and date filters. CSV exports are aggregate-oriented. JSON summary exports are redacted by default:

- `filters.paths` becomes `[redacted]`
- session `filePath` values become `[redacted]`
- session `cwd` values become `[redacted]`
- repeated-prompt sample text and content-derived IDs become `[redacted]`

Default JSON still includes project names, timestamps, session IDs, model names, and usage counts. Users should review exports before sharing.

Raw JSON can be requested through the CLI with `--raw` or through the local API with `privacy=raw`. Raw JSON is for private local use only.

Future export modes should include:

- aggregate-only export
- redacted detailed transcript export
- explicit raw local transcript export

Raw local export should be explicit and clearly labeled.
