# Manual QA Fix Plan - 2026-05-20

## Goal

Fix every issue documented in `docs/manual-qa-report-2026-05-20.md`, with stability first, then user-facing correctness, then export and Audit workflow polish. The work should remain fixture-driven and privacy-conscious.

## Guiding Principles

- Do not use raw local Codex logs for regression coverage.
- Prefer native UI smoke coverage for window lifecycle, source selection, search, export, and Audit regressions.
- Keep manual QA artifacts out of tracked fixture directories.
- Preserve app-local parsing and redacted export defaults.
- Rebuild, package, smoke test, and relaunch the packaged app after user-visible native changes.

## Execution Order

1. Fix native smoke cleanup and process lifecycle.
2. Fix window lifecycle around source picker and external help/docs.
3. Add regression coverage for those lifecycle paths.
4. Fix misleading operational-filter empty state.
5. Fix export save-panel defaults and destination memory.
6. Fix Audit manual path entry.
7. Run full verification and a short manual regression pass.

## Phase 1 - Stabilize UI Smoke Cleanup

Issues covered:

- QA-001 - Native UI Smoke Leaves App And Engine Processes Running

Likely files:

- `scripts/smoke-native-ui.mjs`
- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`
- `apps/macos/Sources/CodexLogViewerMac/CodexLogViewerApp.swift`

Plan:

1. Reproduce `npm run smoke:mac-ui` from a clean packaged app state.
2. Make `scripts/smoke-native-ui.mjs` always run cleanup before asserting leaks:
   - request app quit
   - wait briefly for app and engine exit
   - kill the launched child process if needed
   - only then run leak detection
3. Scope leak detection to the app path launched by the smoke test so unrelated running builds do not create false failures.
4. Review `scheduleUITestWorkflowIfNeeded` to confirm the smoke workflow reaches `NSApp.terminate(nil)` on success and stops the engine on failure.
5. Add diagnostic output when auto-quit does not happen, including app exit code, signal, stdout, stderr, and remaining process list.

Acceptance criteria:

- `npm run smoke:mac-ui` passes.
- A forced smoke failure does not leave the packaged app or bundled engine running.
- Leak assertions still fail when a process truly remains after cleanup.

## Phase 2 - Fix Main Window Lifecycle

Issues covered:

- QA-002 - Source Picker Can Leave The App Running With No Viewer Windows
- QA-003 - Opening The Usage Guide Can Leave The App Running With No Viewer Windows

Likely files:

- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`
- `apps/macos/Sources/CodexLogViewerMac/CodexLogViewerApp.swift`
- `scripts/smoke-native-ui.mjs`

Plan:

1. Reproduce both no-window cases with the packaged app and sanitized fixture:
   - `Logs > Choose Codex Log Location... > sample-session.jsonl > Choose`
   - `Help > Codex Log Viewer Help > Open Usage Guide`
2. Identify whether the window is closing, hiding, moving to another space, or losing its accessibility registration.
3. Add a small main-window restoration helper in the app layer if needed:
   - ensure there is an ordered-front viewer window after modal panels dismiss
   - activate the app after source selection and after returning from help/docs actions
   - avoid creating duplicate windows when a viewer window already exists
4. For source picking, make `chooseSourcePaths()` explicitly return focus to the viewer after `setSourcePaths(...)`.
5. For help/docs, avoid letting the help alert or `NSWorkspace.shared.open(...)` leave the app with no viewer window.
6. Add smoke coverage that checks window count after source selection and usage-guide opening.

Acceptance criteria:

- Selecting a source returns to a visible viewer window with the selected data loaded.
- Opening the usage guide does not remove the main viewer window.
- The app remains reachable from the Dock/App Switcher with a visible window.
- Regression coverage fails if window count drops to zero after these flows.

## Phase 3 - Correct Browse Empty States For Operational Filters

Issues covered:

- QA-004 - Operational Filter Empty State Is Misleading In Browse

Likely files:

- `apps/macos/Sources/CodexLogViewerMac/RootView.swift`
- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`

Plan:

1. Add a model helper for the project-level Browse list, such as `areBrowseMessagesHiddenByOperationalFilters`.
2. In `projectMessagesContent`, distinguish:
   - no submitted messages exist in the current source/project/date scope
   - submitted messages exist, but current operational filters hide all visible rows
3. Reuse the clearer session-level wording:
   - title: `No Visible Messages`
   - description: `Turn on at least one operational message family in the View menu.`
4. Confirm status text continues to show `0 visible of N sent`.
5. Extend native UI smoke or model workflow smoke to hide `Testing/verification` and assert the project-level empty-state copy.

Acceptance criteria:

- Hiding the only operational category no longer claims there are no matching submitted messages.
- The empty state points the user to the View menu.
- The fix works with the session browser both hidden and visible.

## Phase 4 - Make Export Destinations Safer

Issues covered:

- QA-005 - Export Save Panels Default Into The Current Log Source Location

Likely files:

- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`
- `apps/macos/Sources/CodexLogViewerMac/Models.swift` if a new default key is useful
- `scripts/smoke-native-ui.mjs` or a future export smoke helper

Plan:

1. Add a dedicated export directory setting that is separate from log source paths.
2. Choose a safer default destination:
   - previously used export directory, if available
   - otherwise `~/Downloads`
   - otherwise the user's home directory
3. Set `NSSavePanel.directoryURL` before presenting the panel.
4. After a successful export, persist the selected destination directory.
5. Consider a small guardrail when the destination sits inside `sourcePaths`:
   - either warn the user
   - or simply avoid defaulting there while still allowing an intentional choice
6. Keep JSON's redaction warning unchanged.
7. Add coverage at least at the model/helper level for resolving export directories; add UI smoke if practical.

Acceptance criteria:

- JSON and CSV save panels no longer default into fixture/source folders.
- Repeated exports default to the last chosen export directory.
- Export files are still written correctly and JSON stays redacted by default.

## Phase 5 - Fix Audit Manual Path Entry

Issues covered:

- QA-006 - Manual Audit Path Entry Does Not Enable Generate Reliably

Likely files:

- `apps/macos/Sources/CodexLogViewerMac/RootView.swift`
- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`

Plan:

1. Reproduce direct typing and paste into the Audit repository field.
2. Replace the direct `$model.auditRepoPathDraft` binding with an explicit binding if needed:
   - getter returns `auditRepoPathDraft`
   - setter calls a model method such as `setAuditRepoPathDraft(_:)`
3. In the setter method:
   - update the published path
   - clear the preview
   - clear stale status messages where appropriate
   - avoid clearing preview repeatedly when the value has not changed
4. Decide whether `canGenerateAudit` should require only non-empty text or also an existing directory.
5. Add smoke coverage for manual text entry enabling Generate before picker selection.

Acceptance criteria:

- Typing or pasting a valid repository path enables Generate.
- Picker selection continues to enable Generate.
- Changing the path clears stale preview data.
- Invalid or empty paths keep Generate disabled if validation is added.

## Phase 6 - Regression Coverage Expansion

Issues covered:

- All QA tickets

Likely files:

- `scripts/smoke-native-ui.mjs`
- `scripts/check-native-accessibility.mjs`
- `apps/macos/Sources/CodexLogViewerMac/AppModel.swift`
- `apps/macos/Sources/CodexLogViewerMac/CodexLogViewerApp.swift`

Plan:

1. Add accessibility identifiers if any new controls or messages need stable targeting.
2. Extend the native UI smoke path to cover:
   - source picker completes with window still visible
   - usage guide opening does not remove viewer window
   - operational filter hidden state shows correct empty text
   - Audit manual path entry enables Generate
3. Keep export-write assertions fixture-safe:
   - write into a temporary ignored destination
   - remove artifacts after verification
4. Keep smoke tests deterministic with sanitized fixtures and ephemeral settings.

Acceptance criteria:

- Existing smoke coverage still passes.
- New smoke coverage fails for each previously observed regression.
- No tracked fixture export artifacts are left behind after tests.

## Final Verification Checklist

Run from a bootstrapped worktree:

```sh
wt bootstrap
npm run check:mac-accessibility
npm run smoke:mac-ui
npm run smoke:mac-package
npm run package:mac
npm run smoke:mac-ui
git diff --check
```

For the final user-visible native app pass:

1. Relaunch `dist/macos/Codex Log Viewer.app`.
2. Select the sanitized fixture source.
3. Confirm source selection keeps a visible window.
4. Open Help and usage guide, then return to a visible app window.
5. Hide and restore `Testing/verification`; confirm Browse empty-state copy.
6. Export JSON and CSV into a safe temporary destination.
7. Type an Audit repository path manually and confirm Generate enables.
8. Generate and approve an Audit preview into a temporary ignored repository.

## Release Notes For The Fix Pass

When implementation is complete, summarize the fixes as:

- Improved native UI smoke cleanup and process leak detection.
- Fixed viewer-window restoration after source and help/documentation flows.
- Clarified Browse empty states when operational filters hide messages.
- Moved export defaults away from log source folders.
- Fixed Audit repository path entry so manual input and picker input behave consistently.
