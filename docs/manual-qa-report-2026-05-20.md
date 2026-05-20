# Manual macOS QA Report - 2026-05-20

## Scope

This pass exercised the packaged native macOS app as a power-user workflow, using sanitized fixture data instead of raw local Codex logs.

Primary fixture source:

- `<repo>/fixtures/codex/sample-session.jsonl`

Temporary write targets:

- ignored export files created during the pass and removed afterward
- `<tmp>/codex-log-viewer-qa-audit-repo/docs/ai-worklog.md`

No raw local session logs, private prompts, screenshots, or export payloads were added to the repository.

## Test Plan

### Launch And Baseline

- Bootstrap the worktree before local verification.
- Launch the packaged macOS app from `dist/macos/Codex Log Viewer.app`.
- Confirm the main window appears and the local engine starts.
- Load the sanitized fixture through `Logs > Choose Codex Log Location...`.
- Confirm the sidebar, header metrics, cache status, project list, and selected source all update.

### Menus

- App menu: open About.
- File menu: create a new tab and close it.
- View menu: toggle `Show Sessions`.
- View menu: toggle `Operational Messages > All`.
- View menu: toggle each operational category.
- Logs menu: inspect Status, Refresh, Rebuild Local Cache, Find in Messages, Search Messages, source picker, default source, recent source, JSON export, and CSV export.
- Help menu: open help and open the usage guide.

### Browse

- Select `All Projects`.
- Select the fixture project.
- Toggle the session browser on and off.
- Select a session.
- Select a sent user message.
- Confirm the interaction pane shows the matching user message, assistant response, token counts, duration, and first-token timing.
- Confirm operational-category filtering updates visible message counts.

### Overview

- Open Overview.
- Verify metric cards for sessions, sent messages, automations, unique messages, total tokens, fresh/cached input, output, and reasoning.
- Verify Project Focus category summary.
- Verify charts render without blocking the rest of the UI.

### Search

- Focus search from the Logs menu.
- Search for `parser`.
- Verify user-role search returns the fixture user message.
- Select a search result.
- Verify selected-result metadata and preview.
- Use copy actions for session id, project, and matched text.
- Use `Show Conversation` and confirm Browse opens the matching interaction.
- Test role filters: All, User Sent, Automation, Assistant, System, Developer.
- Test the model filter with `gpt-5.5` and `All Models`.
- Click search-table sort headers.

### Date Filters

- Open the date-range popover.
- Select All Time, Day, Week, Month, Year, and Custom.
- Clear the filter and confirm All Time is restored.

### Exports

- Export redacted JSON and confirm the privacy warning appears.
- Confirm JSON export writes parseable summary data and does not include raw local user paths.
- Export CSV and confirm the save panel writes a file.
- Remove generated export files from tracked fixture locations after verification.

### Audit

- Open Audit.
- Choose a temporary repository.
- Toggle `Responses`.
- Generate an audit preview.
- Approve the preview into the temporary worklog.
- Confirm the saved status message and written file.

## Verification Results

- `wt bootstrap` completed successfully.
- `npm run check:mac-accessibility` passed for 39 controls.
- `npm run smoke:mac-ui` failed because the smoke run left the packaged app and child engine running.
- CLI fixture summary confirmed the selected fixture has 1 session, 1 user message, 1 assistant message, 17,277 total tokens, 1 unknown event, and 1 parse warning.
- Manual fixture loading, Browse, Overview, Search, date filters, View filters, refresh/rebuild, recent-source restore, JSON export, CSV save, Audit preview, and Audit save were exercised.

## Issue Tickets

### QA-001 - Native UI Smoke Leaves App And Engine Processes Running

Severity: High

Status: Reproducible during this pass

Observed:

- `npm run smoke:mac-ui` failed with a leaked packaged app process and a leaked bundled engine process.
- The app remained running after the smoke script expected it to quit.

Expected:

- The smoke script should either drive the app to a clean exit or terminate the launched app and child engine before asserting no leaks.

Repro:

1. Run `npm run smoke:mac-ui`.
2. Observe the failure reporting remaining app and engine processes.

Implementation notes:

- Inspect the auto-quit path in `scripts/smoke-native-ui.mjs` and the app's `CODEX_LOG_VIEWER_UI_TEST_AUTO_QUIT` / workflow smoke handling.
- Add a stronger cleanup path in the smoke script so failed UI assertions do not leave processes behind.
- Preserve the existing child-engine leak assertion, but make cleanup deterministic before the final assertion.

### QA-002 - Source Picker Can Leave The App Running With No Viewer Windows

Severity: High

Status: Reproducible during this pass

Observed:

- After selecting `sample-session.jsonl` from `Logs > Choose Codex Log Location...`, the source was accepted, but the app process remained with zero visible windows.
- Relaunching the app showed the selected fixture source and loaded the expected data.

Expected:

- Choosing a source should dismiss the picker and return to the existing viewer window with the scan result visible.

Repro:

1. Open the packaged app.
2. Choose a fixture file from `Logs > Choose Codex Log Location...`.
3. Click `Choose`.
4. Check whether the main viewer window remains visible.

Implementation notes:

- Review `NSOpenPanel.runModal()` usage in `AppModel.chooseSourcePaths()`.
- Check whether panel dismissal or focus restoration is interacting with `WindowGroup` lifecycle.
- Add a manual or automated regression that verifies `count of windows` remains at least 1 after source selection.

### QA-003 - Opening The Usage Guide Can Leave The App Running With No Viewer Windows

Severity: High

Status: Reproducible during this pass

Observed:

- From the Help alert, clicking `Open Usage Guide` opened the external guide target but left the packaged app process with zero visible windows.

Expected:

- Opening documentation should keep the viewer window alive and returnable.

Repro:

1. Open `Help > Codex Log Viewer Help`.
2. Click `Open Usage Guide`.
3. Return to Codex Log Viewer and check whether the main window still exists.

Implementation notes:

- Review `AppModel.openUsageGuide()` and any activation/focus behavior around `NSWorkspace.shared.open`.
- Consider opening documentation without closing or invalidating the app's only viewer window.
- Add a UI smoke assertion that `Help > Open Usage Guide` does not remove the main window.

### QA-004 - Operational Filter Empty State Is Misleading In Browse

Severity: Medium

Status: Reproducible during this pass

Observed:

- Hiding the `Testing/verification` operational category removed the only visible user message.
- The middle Browse column showed `No Sent Messages` with copy saying no submitted messages match the selected project/date filters.
- The status bar correctly said `0 visible of 1 sent`.

Expected:

- When messages exist but are hidden by operational filters, the empty state should say that filters are hiding messages and point the user to `View > Operational Messages`.

Repro:

1. Load the sample fixture.
2. Stay in Browse with the session browser hidden.
3. Turn off `View > Operational Messages > Testing/verification`.
4. Observe the empty state.

Implementation notes:

- `SessionMessagesView` already has clearer language for hidden operational messages.
- Apply similar hidden-filter awareness to the project-level Browse message list.

### QA-005 - Export Save Panels Default Into The Current Log Source Location

Severity: Medium

Status: Reproducible during this pass

Observed:

- With the fixture file selected as the source, JSON and CSV export save panels defaulted into the fixture/source location.
- This made it easy to write generated export files into a tracked source-data directory.

Expected:

- Exports should default to a safer user output location, such as the last export destination, Downloads, or an app-controlled export folder.

Repro:

1. Select a fixture or source directory.
2. Run `Logs > Export Redacted JSON...` or `Logs > Export CSV...`.
3. Observe the default save location.

Implementation notes:

- Set `NSSavePanel.directoryURL` explicitly.
- Remember the last export directory separately from log source paths.
- Consider warning if the destination is inside a known source path.

### QA-006 - Manual Audit Path Entry Does Not Enable Generate Reliably

Severity: Medium

Status: Reproducible during this pass through accessibility-driven entry

Observed:

- Entering the temporary repository path into the Audit text field left `Generate` disabled even though the visible field contained a valid path.
- Choosing the same repository through `Choose Repository` enabled `Generate`.

Expected:

- Manual text entry and picker-based selection should both update `auditRepoPathDraft` and enable `Generate`.

Repro:

1. Open Audit.
2. Type or paste a valid repository path into the repository path field.
3. Observe whether `Generate` enables.
4. Use `Choose Repository` for the same path and compare behavior.

Implementation notes:

- Validate the SwiftUI `TextField` binding and `onChange` behavior for direct keyboard entry, paste, and accessibility value setting.
- Add an accessibility or unit-level test for direct path entry enabling the Generate button.

## Follow-Up Implementation Plan

1. Fix process cleanup in `smoke-native-ui.mjs` and confirm `npm run smoke:mac-ui` passes without leaked app or engine processes.
2. Investigate the shared window-lifecycle failure after source selection and usage-guide opening.
3. Add UI regression checks for window presence after source picker and Help usage-guide flows.
4. Improve Browse empty-state copy when operational filters hide all messages.
5. Set an explicit, safe default export directory and remember the last export destination.
6. Fix Audit manual path-entry state propagation and add coverage.
7. Re-run `npm run check:mac-accessibility`, `npm run smoke:mac-ui`, and a focused manual source/export/Audit pass.

## Notes

- The app was left open at the end of the pass for review.
- Generated fixture export files were removed.
- The temporary audit test repository is outside the project tree.
