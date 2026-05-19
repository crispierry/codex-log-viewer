# Changelog

All notable changes to Codex Log Viewer will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to follow semantic versioning after the first public release.

## Unreleased

- Added project foundation documentation.
- Added research and roadmap for Codex log parsing and analytics.
- Added TypeScript parser, analytics package, CLI, and private local API engine.
- Added sanitized Codex fixture coverage and unit tests.
- Added GitHub Actions CI.
- Added a native SwiftUI macOS app as the primary product surface.
- Added project selection, source paths, exports, searchable sessions, and session details to the native app.
- Added persisted local date filter settings to the native app.
- Added cross-project message search with project/date/source filtering.
- Added a native Messages I Sent action for browsing submitted user prompts by project without generated context wrappers.
- Added role, model, and session filters for message search.
- Added repeated-prompt grouping for current project/source/date filters.
- Added native search-result copy actions for session id, project, and sanitized snippets.
- Added native empty states, retry recovery, and keyboard shortcuts for core log workflows.
- Added packaged macOS app creation with bundled local engine, bundled Node runtime, app icon, zip artifact, and checksum.
- Added packaged app and native UI smoke tests.
- Added Finder-style and relocated packaged app launch verification.
- Added packaged app missing-engine failure verification.
- Added ephemeral-token authentication for the private local API.
- Added Dependabot configuration for npm and GitHub Actions dependency maintenance.
- Added redacted JSON exports by default, with explicit raw JSON for private local use.
- Added a release notes template for public GitHub releases.
- Added synthetic parser event-shape coverage and search performance benchmarking.
- Updated documentation to reflect the native-macOS-first product workflow.
- Fixed native app filter/session state races so project selections and session details update reliably.
- Fixed project-scoped local API sessions and exports so selected-project views do not leak all-project results.
- Fixed duplicate session-id handling so summaries, search, and session details are scoped by source file when needed.
- Strengthened native UI smoke coverage for accessibility identifiers and selected-project exports.
- Removed the web dashboard and Electron prototype.
- Added a UI test plan for native app workflows.
- Added macOS app build verification to CI.
