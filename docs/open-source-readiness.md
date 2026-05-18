# Open Source Readiness

This project is safe to prepare as a public repository when this checklist stays true.

## Repository Hygiene

- License, security policy, code of conduct, contributing guide, issue templates, and pull request template are present.
- `README.md` leads with the native macOS app and documents the CLI as an automation fallback.
- CI verifies the TypeScript parser, analytics, private API engine, CLI, and macOS Swift build.
- Generated folders such as `node_modules`, `dist`, `.build`, coverage, and local caches are ignored.
- The root package is marked private so the monorepo is not accidentally published to npm.

## Privacy Gate

- Do not commit real files from `~/.codex/sessions` or `~/.codex/archived_sessions`.
- Do not commit private screenshots, local app recordings, or exports from real logs.
- Treat JSON exports as private unless they have been reviewed and redacted.
- Fixtures must be synthetic or heavily redacted while preserving event shape.
- Public examples must use neutral project names such as `sample-app`.
- Issue and pull request templates warn contributors not to paste unsanitized logs.

## Public GitHub Settings

After creating or publishing the repository:

- Enable GitHub private vulnerability reporting.
- Keep branch protection on the default branch once collaboration begins.
- Require the `verify` and `macos-app` CI jobs before merging.
- Add repository topics such as `codex`, `macos`, `swiftui`, `jsonl`, `local-first`, and `analytics`.
- Add a short repository description: `Local-first macOS app and parser for Codex session logs.`

## Release Readiness

The current repo is ready for public source sharing. A downloadable end-user release still needs:

- signed/notarized `.app` packaging
- app icon
- release artifact workflow
- screenshot or short demo recording using sanitized data
