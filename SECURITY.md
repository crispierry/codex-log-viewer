# Security Policy

## Supported Versions

This project is pre-release. Security fixes will target the default branch until versioned releases begin.

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities involving secret leakage, unsafe log handling, path traversal, export disclosure, or unsafe dashboard behavior.

Until a dedicated security contact is published, report sensitive concerns privately to the repository owner.

## Security Principles

- Never require users to upload Codex logs to a remote service
- Keep raw session content local by default
- Redact secrets in fixtures, screenshots, issue reports, and exports
- Treat unknown JSONL fields as potentially sensitive
- Avoid executing content from logs
- Avoid following arbitrary paths from log content without explicit user intent

## Sensitive Data In Scope

Codex logs may include:

- prompts and assistant responses
- local file paths
- terminal commands and output
- code snippets and diffs
- environment details
- tool call arguments
- copied text from private documents or websites
- images or local image references

See [Privacy and Redaction](docs/privacy-and-redaction.md).
