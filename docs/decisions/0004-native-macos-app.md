# 0004: Native macOS App

Date: 2026-05-18

## Status

Accepted

## Context

Codex Log Viewer needs access to local Codex session logs. A browser-first product asks users to think about local servers and file access, which is the wrong shape for a private local utility.

The product should feel like a macOS utility. Users should see familiar Mac patterns: a source/project sidebar, native toolbar actions, native tables, inspector panels, file and folder pickers, application settings, and eventually a signed `.app` bundle.

## Decision

Codex Log Viewer will be native-macOS-first.

The only user-facing app surface is a SwiftUI macOS app in `apps/macos`. It may continue to reuse the TypeScript parser through a private local API engine while the native UI matures.

## Consequences

- `npm run app:mac` launches the SwiftUI app.
- Native UX work belongs in `apps/macos`.
- The private local API remains the bridge between the SwiftUI app and the existing parser/analytics engine.
- Future packaging work should create a signed/notarized `.app` from the SwiftUI app.
- Native file/folder picking, settings, search indexing, and inspector workflows should use macOS APIs.
