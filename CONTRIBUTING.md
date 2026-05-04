# Contributing

Thanks for helping build Codex Log Viewer.

This project will handle local agent session logs that can contain private code, prompts, terminal output, file paths, and secrets. Please keep privacy in mind when opening issues, adding fixtures, or sharing screenshots.

## Good First Contributions

- Improve documentation and project planning docs
- Add sanitized Codex JSONL fixtures for new event shapes
- Add parser tests around known rollout records
- Improve project attribution rules
- Improve redaction utilities and fixture-sanitizing scripts
- Improve dashboard accessibility, responsive layout, and session-inspection workflows

## Fixture Safety

Before contributing a fixture:

- Remove secrets, credentials, tokens, cookies, and private URLs
- Replace private paths with stable sample paths
- Replace proprietary code or business text with small synthetic examples
- Preserve the event shape, field names, nesting, timestamps, and token fields
- Keep enough realistic structure for parser tests to be meaningful

See [Fixture Guidelines](docs/fixture-guidelines.md).

## Pull Request Expectations

- Keep changes focused
- Add or update docs when behavior changes
- Add fixtures and tests for parser changes
- Include a short note about privacy impact when touching exports, fixtures, or raw-event views
- Do not include real Codex logs from your machine

## Development Setup

```sh
npm install
npm run lint
npm test
npm run build
```

Run the dashboard:

```sh
npm run serve
```

Run the CLI fallback through the root helper:

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

The stack is documented in [Architecture](docs/architecture.md).
