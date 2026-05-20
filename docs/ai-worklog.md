# AI Worklog

Sanitized audit trail of AI-assisted work on this project.

## 2026-05-20 - Execute Manual QA Fix Plan

Status: Completed
Related commit/PR: TBD

### User Messages

> /goal execute the Manual QA Fixed Plan make sure that it's properly tested and everything is working to a full regression pass and verify that the app is working as intended

> do we have much more to go?

> i think we are done

### Interpreted Intent

The user wanted the documented manual QA issues fixed, regression-tested, packaged, and verified in the native macOS app, then stopped once they indicated the pass was complete enough.

### Response / Work Done

- Implemented native smoke cleanup so the packaged app and child parser engine are quit and leak-checked after UI smoke runs.
- Restored the viewer window after source picker, Help, usage-guide, and app-reopen lifecycle paths.
- Added a fallback AppKit viewer window path when SwiftUI window reopening cannot recover a visible viewer.
- Clarified Browse empty-state copy when operational filters hide every visible submitted message.
- Changed export save panels to default to a safe directory such as Downloads instead of the selected log source.
- Fixed Audit repository path typing so manual entry clears stale preview state and enables Generate.
- Expanded the native UI smoke workflow to cover operational hidden-message behavior, safe export defaults, Audit path entry, and process cleanup.
- Rebuilt and repackaged the macOS app for desktop review.

### Privacy Notes

No raw Codex logs, unsanitized session files, private prompts, screenshots, recordings, export payloads, or secrets were added. Manual verification used the sanitized fixture session and temporary local QA directories.

### Verification

- Ran `wt bootstrap`.
- Ran `node --check scripts/smoke-native-ui.mjs`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `swift build --package-path apps/macos`.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run privacy:scan`.
- Ran `npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui` before the final Usage Guide fallback patch; did not start another UI smoke after the user indicated the pass was done.
- Manually verified source picker restoration, Browse, Overview, Search role/model/date filters, operational filter empty state, JSON/CSV export save destinations, Audit manual path entry, and Help dialog behavior in the packaged app.

## 2026-05-20 - Manual QA Issue Fix Plan

Status: Completed
Related commit/PR: TBD

### User Messages

> All right create a plan to fix all the issues

### Interpreted Intent

The user wanted the manual QA findings converted into an actionable implementation plan that can be used to fix every documented issue in a later coding pass.

### Response / Work Done

- Reviewed the manual QA report and the relevant native app and smoke-test code paths.
- Created `docs/manual-qa-fix-plan-2026-05-20.md` with ordered phases, likely files to touch, implementation steps, acceptance criteria, and final verification.
- Sequenced the plan to address process/window lifecycle defects first, then Browse empty-state copy, export destination safety, Audit manual path entry, and expanded regression coverage.

### Privacy Notes

No raw Codex logs, private sessions, screenshots, recordings, export payloads, or secrets were added. The plan references sanitized fixture workflows and code paths only.

### Verification

- Documentation-only change; no app rebuild or relaunch was needed.

## 2026-05-20 - Manual macOS Power-User QA Pass

Status: Completed
Related commit/PR: TBD

### User Messages

> I want you to create a detailed plan to test our application. I want you to open the app on my desktop and I want you to use every feature of it and make sure that it's working as intended. Click on every menu item. Click on every aspect of the UI. Do all the filters. Act as a power user would. Test everything that's in there and make sure you document any issues that come up.
>
> If there are any issues found, create an implementation plan or create an issues ticket document with all the issues found so that later we can create an implementation plan to address every single one of them. Do you understand what I'm asking for? I want you to drive my application on my desktop. I want you to use every feature and capability of it and I want you to verify that it's working as intended, including every menu item and all the capabilities available. Then I want you to document any and every issue found and then we're going to create a plan to fix them.

### Interpreted Intent

The user wanted a hands-on native macOS QA pass that treated the app like a power-user would, exercised the menu and UI surface, verified filters and workflows, and produced a ticket-style issue document plus a follow-up implementation plan.

### Response / Work Done

- Bootstrapped the worktree before verification.
- Launched and drove the packaged native macOS app on the desktop.
- Used sanitized fixture data for source selection, Browse, Overview, Search, date filtering, operational filters, refresh/rebuild, exports, and Audit workflows.
- Tested app menus including About, New Tab, View toggles, Logs commands, exports, Help, usage guide opening, default source, and recent source restoration.
- Created `docs/manual-qa-report-2026-05-20.md` with a detailed test plan, verification results, issue tickets, and a follow-up implementation plan.
- Cleaned generated export artifacts from tracked fixture locations after verification.

### Issues Found

- Native UI smoke can leave the packaged app and child engine running.
- Source picker and Help usage-guide flows can leave the app process running with no viewer windows.
- Browse's empty state is misleading when operational filters hide all visible messages.
- Export save panels can default into the selected log source location.
- Audit manual path entry did not reliably enable Generate during the accessibility-driven pass.

### Privacy Notes

No raw Codex logs, unsanitized session files, screenshots, recordings, private prompts, export payloads, or secrets were added. The QA report uses sanitized fixture references and redacted path placeholders.

### Verification

- Ran `wt bootstrap`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run smoke:mac-ui` and documented its process-leak failure.
- Ran fixture CLI summary and project checks.
- Manually exercised the packaged macOS app with sanitized fixture data.

## 2026-05-20 - Draft LinkedIn Article About Codex Log Viewer

Status: Completed
Related commit/PR: TBD

### User Messages

> Now I wanna write an article about the creation of this log viewer
>
> Let's talk about the user needs: why did we need to create it? Let's talk about the whole iteration process. Let's talk about its capabilities and I want to reference why I believe this is important. I believe the user messages represent their overall user intent and they become a critical item on the other trail for how a program is operating
>
> This is going to be a LinkedIn article. It needs to be written in a professional manner. It needs to reflect my position. It needs to sound like it came from me as a person
>
> It needs to be the right size and I need it to be in paragraphs not bullets
>
> Understand the goal:
> - Outline what the user needed
> - Outline why we think it's important
> - Describe how the app was created and its capabilities and how it will be used in the future

### Interpreted Intent

The user wanted a professional LinkedIn article draft that explains why Codex Log Viewer was needed, how it evolved, what it can do, and why user messages should be treated as an important audit trail for AI-assisted software work.

### Response / Work Done

- Reviewed the repository README, product requirements, audit-trail documentation, usage guide, macOS app plan, changelog, and existing worklog entries to ground the article in the actual project.
- Drafted `docs/linkedin-log-viewer-article.md` as a paragraph-based LinkedIn article in first person.
- Framed the article around local-first privacy, user intent, auditability, iteration through real usage, Project Focus classification, and future use.

### Privacy Notes

No raw Codex logs, private session content, local file paths, screenshots, recordings, or customer data were added. The article uses public project concepts and sanitized implementation descriptions.

### Verification

- Documentation-only change; no app rebuild or relaunch was needed.

## 2026-05-20 - Sync Search Conversation Navigation

Status: Completed
Related commit/PR: TBD

### User Messages

> When we go from search results and I click Show message, we go back to the other page and we show the right message. However the conversation column is highlighting the wrong conversation. You need to move that to put me in the correct conversation and then show the conversation on the right. Do you understand what I'm saying?

> Make sure that the project is also showing the right scene. Now either go to all projects or go to the relevant project in question

### Interpreted Intent

The user wanted Search's `Show Conversation` action to navigate the whole Browse scene consistently: project scope, message-list highlight, scroll position, and right-hand conversation detail should all point to the same conversation.

### Response / Work Done

- Changed Search result navigation to keep `All Projects` when that is the active scope, or switch to the result's project when Browse is scoped to another project.
- Added pending conversation navigation so project changes wait for the destination project's summary and message list before selecting the conversation.
- Synchronized the Browse user-message row to the user prompt that owns the selected search result, including assistant-result hits that resolve to their containing user interaction.
- Added automatic scrolling in the Browse user-message list so the selected conversation row is brought into view after navigation.
- Converted the project sidebar selection to route through `AppModel.selectProject` directly instead of a separate `onChange`, so programmatic project navigation does not trigger a second reset.
- Extended the native UI smoke workflow to assert assistant search-result navigation resolves to the expected user-message highlight.
- Rebuilt and packaged the macOS app as build 96, then relaunched the packaged app for review.

### Privacy Notes

No raw Codex logs, unsanitized session files, screenshots, recordings, or real local paths were added. Verification uses sanitized fixtures only.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `npm run check:mac-accessibility`.
- Ran `git diff --check`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched `dist/macos/Codex Log Viewer.app`.

## 2026-05-20 - Keep Show Sessions Toggle Enabled

Status: Completed
Related commit/PR: TBD

### User Messages

> Also I'm not able to turn off show sessions once the sessions are being displayed

### Interpreted Intent

The user wanted the `View > Show Sessions` menu toggle to remain enabled after the session browser column is displayed, so the column can be turned off from the same menu.

### Response / Work Done

- Confirmed the menu item was falling back to the disabled command state when the command layer did not have a focused app model.
- Published each window's `AppModel` as a scene-level focused value in addition to the existing view-level focused value, so transient focus changes inside the split view do not disable the View menu commands.
- Rebuilt and packaged the macOS app as build 95, then relaunched the packaged app for review.

### Privacy Notes

No raw Codex logs, unsanitized session files, screenshots, recordings, or real local paths were added.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `npm run check:mac-accessibility`.
- Ran `git diff --check`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched `dist/macos/Codex Log Viewer.app`.
- Activated the relaunched app with System Events, toggled `View > Show Sessions` on and off, and confirmed the menu item remained enabled after each toggle.

## 2026-05-20 - Clarify Operational All Toggle

Status: Completed
Related commit/PR: TBD

### User Messages

> I should be able to select all and see all the check marks right away. Also the list of categories you showed is only a subset. I want to make sure when I'm selecting all you're including all messages. Is that right

### Interpreted Intent

The user wanted the operational `All` toggle to visibly update every category checkbox immediately and wanted confirmation that selecting `All` restores the full in-scope message list, not only a subset of operational categories.

### Response / Work Done

- Updated repeated-prompt and operational filter setters to assign fresh category sets after changes, giving SwiftUI a direct state update for immediate menu checkmark refresh.
- Clarified the native help text and usage guide: checked `All` hides no operational category, so all messages matching the current app filters are visible; unchecked `All` hides only the operational families listed in the menu.
- Rebuilt and packaged the macOS app as build 94, then relaunched the packaged app for review.

### Privacy Notes

No raw Codex logs, unsanitized session files, screenshots, recordings, or real local paths were added.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `npm run check:mac-accessibility`.
- Ran `git diff --check`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched `dist/macos/Codex Log Viewer.app`.

## 2026-05-20 - Align Operational Filters With Project Focus Categories

Status: Completed
Related commit/PR: TBD

### User Messages

> I just ran into a bug when I said "view operational messages" and all is not working anymore so we need to address that
>
> Can you figure out what happened? I believe our new content classification messed that up so see if that's still appropriate and what categories we need to include
>
> It's something where we need to include or exclude some of those categories

### Interpreted Intent

The user wanted the `View > Operational Messages` menu fixed after the newer Project Focus classifier introduced category labels that the older operational filter did not know how to hide.

### Response / Work Done

- Traced operational filtering across analytics, the local API, Browse/Search/session detail visibility, repeated prompt groups, and the native View menu.
- Replaced the older narrow operational classifier with an explicit operational subset of Project Focus categories: `Code review/QA`, `Deploy/release`, `Git commands`, `Plan approvals`, `Run/build app`, and `Testing/verification`.
- Updated the native View menu to expose those categories and made the `All` toggle hide every operational category.
- Added settings migration for older saved labels such as `Code review` and `Run app`, including the previous deploy-as-Git behavior for legacy saved filters.
- Expanded analytics and native smoke coverage so all operational categories can be hidden together.
- Updated the usage guide and native help text to document the revised include/exclude behavior.
- Rebuilt and packaged the macOS app as build 93, then relaunched the packaged app for review.

### Privacy Notes

No raw Codex logs, unsanitized session files, screenshots, recordings, or real local paths were added. New coverage uses synthetic fixture messages only.

### Verification

- Ran `npm run test -w @codex-log-viewer/analytics`.
- Ran `npm run build -w @codex-log-viewer/analytics`.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run privacy:scan`.
- Ran `npm run check:mac-accessibility`.
- Ran `git diff --check`.
- Ran `npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched `dist/macos/Codex Log Viewer.app`.

## 2026-05-20 - Final Open Source Readiness Pass

Status: Completed
Related commit/PR: TBD

### User Messages

> I'm pretty happy with all the changes. The app looks good. I'm getting ready to open source this effort. I need you to do a final complete pass of all the documentation and all the source code make sure this is ready for open source.

### Interpreted Intent

The user wanted a final public-readiness audit across documentation, source code, packaging, privacy posture, and verification before opening the repository.

### Response / Work Done

- Reviewed the repository instructions, public docs, fixtures, TypeScript parser/analytics/server/CLI code, native macOS app code, packaging scripts, workflows, and release materials.
- Added `.codex/` to `.gitignore` so local audit drafts and raw transcripts match the documented local-only workflow.
- Updated the fixture README to list the visual image-evidence fixture.
- Clarified the privacy scan scope as tracked and non-ignored untracked files.
- Removed a branch-specific PR reference from the first public release plan and refreshed its review date.
- Updated CLI help so the `sessions` command documents `--path`.
- Changed the packaging script so required notarization settings are validated before the app build number is bumped.
- Scoped the native session inspector's submitted and automation messages to the selected daily session slice when a date-scoped session is selected.
- Rebuilt and packaged the macOS app as build 92, then relaunched the packaged app for review.

### Privacy Notes

No raw Codex logs, private session files, screenshots, recordings, or real local paths were added. The new ignore rule reduces the chance of local audit material being accidentally committed.

### Verification

- Ran `wt bootstrap`.
- Ran `npm run privacy:scan`.
- Ran `npm run lint`.
- Ran `npm test`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm audit --audit-level=moderate`.
- Ran a local Markdown link-resolution check.
- Ran `npm run benchmark:search`.
- Ran `npm run check:reference -- --reference fixtures/codex/sample-reference-summary.json --path fixtures/codex/sample-session.jsonl --project sample-app`.
- Ran `git diff --check`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package` after closing a pre-existing packaged app instance.
- Ran `npm run smoke:mac-ui`.
- Ran `npm run release:notes -- --tag v0.1.0 --output dist/macos/release-notes.md`.
- Ran checksum verification for the packaged macOS archives, including build 92.
- Relaunched `dist/macos/Codex Log Viewer.app`.

## 2026-05-19 - Rename Messages Column Label

Status: Completed
Related commit/PR: TBD

### User Messages

> And the label "messages" should be user messages

### Interpreted Intent

The user wanted the middle Browse column label to be more precise about showing submitted user messages.

### Response / Work Done

- Renamed the middle column header from `Messages` to `User Messages`.
- Renamed the lower middle-column status title to `User Messages` for consistency.
- Rebuilt, packaged, smoke-tested, and relaunched the native app.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native copy change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 91.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Color Message Category Titles

Status: Completed
Related commit/PR: TBD

### User Messages

> I think we can color code the title of each rectangle as well, of each message

### Interpreted Intent

The user wanted the message category label itself to carry the category color, while keeping the card surface restrained.

### Response / Work Done

- Changed prompt category labels to render in their Project Focus category color.
- Kept the card background neutral and preserved the category-colored left rail.
- Rebuilt, packaged, and relaunched the native app for review.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native UI styling change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 90.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Tone Down Message Category Color

Status: Completed
Related commit/PR: TBD

### User Messages

> For the areas of the messages I don't want to color code the whole rectangle. Let's just color code the bracket on the left
>
> Voice is looking too childish

### Interpreted Intent

The user wanted the submitted-message category treatment to feel calmer and more professional by removing full-card category color.

### Response / Work Done

- Removed category-colored fills from submitted-message cards and previews.
- Kept category color only on the left rail of message cards.
- Simplified prompt category labels to neutral text without colored pills or dots.
- Preserved selected/highlighted states with subtle neutral/accent treatment.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native UI styling change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 89.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Lower Native Window Minimum Width

Status: Completed
Related commit/PR: TBD

### User Messages

> I'm also noticing a weird behavior when I grab the window on the right side and I try to reduce it. There is a minimum width that seems too high. Can you adjust our responsive design? We should be able to resize the window to a much smaller size than what we have right now

### Interpreted Intent

The user wanted the native app to stop enforcing an overly wide minimum window size and allow the Browse layout to compress more naturally.

### Response / Work Done

- Reduced the root window minimum width from the old wide desktop default to a compact size.
- Lowered sidebar, workspace, message-column, session-column, and interaction-column minimum widths.
- Relaxed the fixed segmented section picker width so the header can compress more gracefully.
- Rebuilt, packaged, relaunched, and verified the running app can resize to 820x620.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native layout/responsiveness change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 87.
- Confirmed the running window can be resized to 820x620.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Add Messages Column Header

Status: Completed
Related commit/PR: TBD

### User Messages

> Notice how we have a label on the third column but we don't have a label on the middle column .  I also have a label on the left column so let's be consistent and add a label to the middle column.

### Interpreted Intent

The user wanted the Browse layout to label all major columns consistently, with the middle message list receiving a visible top header like the surrounding columns.

### Response / Work Done

- Added a compact top-level `Messages` header with a paper-plane icon to the middle browse column.
- Kept the lower gray status bar as the compact count/status area.
- Rebuilt, packaged, and relaunched the native app for review.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native UI layout change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `git diff --check`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 85.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Refine Prompt Category Cards

Status: Completed
Related commit/PR: TBD

### User Messages

> I color code it in the same way that we do for codex interaction and also move the label to the top of the rectangle.
>
> And while we're at it we can remove the session ID from that rectangle and we can also move the project to the top-level line

### Interpreted Intent

The user wanted submitted-message cards to feel visually aligned with Codex Interaction cards, with prompt category labels and project context promoted into the card header and session IDs removed from the visible card chrome.

### Response / Work Done

- Added a shared prompt-intent card treatment with a subtle tinted background, left color edge, and selected/highlighted outline behavior.
- Moved prompt category labels to the top row of submitted-message cards.
- Moved project names into the top row for browse and search-preview cards.
- Removed the session ID prefix from submitted-message cards.
- Moved Search category labels into the Message column instead of a separate table column.
- Applied the same category-card treatment to selected Search result previews and inspector message previews.

### Privacy Notes

No raw logs or unsanitized session content were added. This was a native UI layout change.

### Verification

- Ran `swift build --package-path apps/macos`.
- Ran `npm run check:mac-accessibility`.
- Ran `git diff --check`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 83.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Add AI audit trail generation

Status: Completed
Related commit/PR: TBD

### User Messages

> /plan I'm wondering if we should save a document with each of my GitHub projects that contains all the user messages we sent and the appropriate responses, some sort of audit trail of all the work that was done. What do you think of the idea? What should the document look like? Probably a markdown file but I wanted to see what you think. Then this idea that this document gets updated every time. Maybe we do an automation of our tool or maybe there's something else we need to do there

> In the new proposal above are we storing every user message I sent? I think that's the important aspect. I want audit. I want to be able to see what the user intent was

> Right the other issue though is we need to retroactively apply this to my GitHub repos . Which is why I was wondering if this should be part of our tour or not.

> Okay let's go execute this

> I want to incorporate all of this into the tool itself. I don't want to be dealing with the CLI. I want to request the generation of the document and I want to review the document from the tool and do all the approvals from the tool
>
> Of course we need a smart merge mode as well

### Interpreted Intent

The user wants durable per-repository audit trails that preserve work-directing user intent, preferably as Markdown, and wants Codex Log Viewer to generate, review, smart-merge, and approve those trails directly from the app.

### Response / Work Done

- Decided the committed audit artifact should preserve every work-directing user message, with redaction where needed.
- Added a shared audit Markdown generator that reconstructs user messages and captured Codex responses from parsed session logs.
- Added smart merge support that preserves existing reviewed worklog text, appends only new generated session sections, and skips obvious duplicates when reviewed user-message quotes already exist.
- Added a CLI `audit` command for generating repository-specific worklog drafts.
- Added local API support for audit preview and approval writes.
- Added an Audit section to the native macOS app for repository path selection, preview generation, Markdown review, and approved save.
- Documented the audit workflow and added a repository rule to keep this worklog updated after meaningful AI-assisted work.

### Privacy Notes

The committed worklog is intentionally sanitized. Raw Codex session JSONL files and fuller transcripts should remain local-only unless reviewed and explicitly sanitized.

### Verification

- Ran `wt bootstrap`.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run privacy:scan`.
- Ran a CLI audit smoke check against the interaction-detail fixture.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Show Project Focus labels on messages

Status: Completed
Related commit/PR: TBD

### User Messages

> enable me to expand and see all categories
>
> add the category lavels to the message colun (and to search) - basiclly anytime we show a user message, I want to see their label/classification as well

### Interpreted Intent

The user wanted Project Focus to reveal the full category breakdown on demand and wanted every displayed submitted user message to carry its Project Focus classification.

### Response / Work Done

- Added an expandable Project Focus category list so the Overview can show all categories instead of only the top set.
- Added prompt-intent fields to message search results and session-detail user messages.
- Rendered category badges in Browse message rows, optional session message rows, Search results, selected Search details, session inspectors, and the Codex Interaction user-message card.
- Kept operational filter categories separate from Project Focus labels so existing `View > Operational Messages` behavior stays intact.
- Added analytics, server, and native smoke assertions for prompt-intent labels on user messages.

### Privacy Notes

No raw logs or unsanitized session content were added. Tests use synthetic fixture prompts.

### Verification

- Ran `npm run test -w @codex-log-viewer/analytics`.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app at build 81.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Add operational message filters

Status: Completed
Related commit/PR: TBD

### User Messages

> what are the user message grouping we created (git, start app, etc)... I would like the ability to filter out some of these groups (via a checkbox)

> mostly I am interested in being able to filter out messages that are operational
>
> like - commit, merge, start server, run app, do a code review, etc

> i want to break down the operational messages -- not just bumbled them all into "operational"

> and show operationa should move to the view menu

> Move this to the app view menu and give me an option for all

### Interpreted Intent

The user wanted clarity on the semantic repeated-prompt groups and wanted native View-menu controls to hide specific operational prompt families from the main message list and repeated-prompt summary, with an all-operational shortcut.

### Response / Work Done

- Confirmed the existing semantic repeated-prompt groups were `Plan approvals`, `Git commands`, and `Run app`.
- Added a `Code review` semantic group for short review requests such as `do a code review`, `review the diff`, and `inspect the changes`.
- Added message categories to local search/browse results so the macOS Browse message list can classify operational prompts.
- Added persistent per-category checkboxes for operational message categories: `Git commands`, `Run app`, and `Code review`.
- Moved the session browser toggle and operational message category toggles into the macOS `View` menu.
- Added a `View > Operational Messages > All` toggle for showing or hiding every operational family at once.
- Kept short approvals separate so they can still be controlled independently in the repeated-prompt summary.
- Documented the grouping rules and checkbox behavior.

### Privacy Notes

No raw Codex logs or unsanitized session content were added. The change only stores local checkbox preferences and category names selected for filtering.

### Verification

- Ran `npm test`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run lint`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Simplify project sidebar rows

Status: Completed
Related commit/PR: TBD

### User Messages

> How can I improve the visibility and usability of this section? It seems really cluttered right now. Maybe we don't need the sessions and the tokens? Is there something we can do? Color coding as well? Separation? This needs to be done better. Please act as a senior principal designer

### Interpreted Intent

The user wanted the project sidebar to feel less cluttered and easier to scan, with less visible operational metadata and clearer hierarchy.

### Response / Work Done

- Simplified project rows to a single-line navigation shape focused on project name and sent-message count.
- Removed visible session and token metadata from each sidebar row while preserving those details in hover/help and accessibility text.
- Added a compact message-count badge and subtle icon tinting to improve scanability without making the sidebar feel like a dense analytics table.

### Privacy Notes

No raw logs or unsanitized session content were added. Existing aggregate counts remain local-only.

### Verification

- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Fix audit review findings

Status: Completed
Related commit/PR: TBD

### User Messages

> code review

> Fix all these issues

### Interpreted Intent

The user wanted the audit feature reviewed for bugs and then wanted all identified review issues fixed.

### Response / Work Done

- Removed basename-only repository matching so audit generation no longer includes unrelated repositories with the same folder name.
- Constrained audit API writes to the selected repository's computed `docs/ai-worklog.md` path.
- Made the native app send the selected repository path when approving an audit write.
- Cleared stale audit previews when the date range changes.
- Added regression tests for same-basename repository filtering and rejected audit target overrides.

### Privacy Notes

The fixes reduce the chance of user intent being written into the wrong repository and reduce the audit API's local file write surface.

### Verification

- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run privacy:scan`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Declutter Browse around messages

Status: Completed
Related commit/PR: TBD

### User Messages

> I'm wondering if I need a daily sessions column. I'm not sure what value it's adding considering that I can filter by date and time above. What is your honest opinion? Do we need the daily sessions? I'm trying to declutter the app a little bit.
> - Project is important.
> - Message is important.
> - The codex information is important.
> I'm not so sure that I need to view the daily sessions. Maybe it should be a setting that we enable and disable and if it's disabled messages should include all messages in the project

> Okay let's do this but one more thing. Right now we have search sessions but we don't have that for any of the other columns so I think search sessions can go away but otherwise execute the plan above

### Interpreted Intent

The user wanted Browse to prioritize the core hierarchy of project, submitted message, and Codex interaction. Session browsing should remain available only when explicitly enabled, and the session-specific search field should be removed.

### Response / Work Done

- Changed Browse so the default layout lists submitted project messages directly and opens the selected message's Codex interaction.
- Added a persistent `Show Sessions` toggle for users who still want the session browser before the message list.
- Removed the session search field from the session browser and related session table surface.
- Kept session/file/date scoping behind message selection so duplicate session ids and copied logs still resolve to the right conversation.
- Updated native accessibility checks and documentation to describe the message-first Browse flow.

### Privacy Notes

No raw Codex session content was added. The Browse changes continue to use existing local-only parsed data and submitted-message filtering.

### Verification

- Ran `wt bootstrap`.
- Ran `npm test`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run lint`.
- Ran `npm run build:mac`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-package`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Hide single-window tab bar

Status: Completed
Related commit/PR: TBD

### User Messages

> I don't think we need the tabs. Right now it allows me to open multiple tabs but I am not sure this is useful for this project. In any case maybe we do keep the tabs open but if there is only one tab we can reclaim the screen real estate. Understand what I mean?
>
> To show the tab bar if I actually create a second tab via the menus

### Interpreted Intent

The user wanted to keep native macOS tabs available without permanently spending vertical space on the tab bar when only one app tab is open.

### Response / Work Done

- Added native window coordination that keeps Codex Log Viewer windows eligible for macOS tabbing.
- Hid the macOS tab bar when the active Codex Log Viewer tab group has only one viewer window.
- Revealed the tab bar automatically when the tab group contains multiple viewer windows.
- Corrected the native window matcher to account for the app's displayed `Codex Logs` window title.
- Added `File > New Tab` so users can intentionally create another viewer tab while the single-tab bar is hidden.
- Fixed the new-tab attachment check so two un-tabbed viewer windows are merged into the same native tab group.
- Made the new-tab command attach to the existing viewer window even when the app has no current key window.

### Privacy Notes

No raw logs or user session content were added. This change only affects native window chrome behavior.

### Verification

- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Replace unavailable native Help fallback

Status: Completed
Related commit/PR: TBD

### User Messages

> Screenshot showed the native Help dialog: "Help isn't available for Codex Log Viewer."

> Okay so why is the help menu there? Is it a requirement? If it's a requirement can we please write a little help?

### Interpreted Intent

The user wanted the Help menu to stop opening macOS's default unavailable-help fallback and instead provide useful in-app guidance.

### Response / Work Done

- Replaced the default macOS Help command with custom `Help > Codex Log Viewer Help` and `Help > Open Usage Guide` menu items.
- Added a small native help panel summarizing Browse, optional Sessions, operational-message filters, source selection, exports, and local-first privacy behavior.
- Tightened the help panel into a brief practical guide covering Browse, filters, Search, Audit, source selection, exports, and privacy.
- Added local usage-guide discovery with a GitHub docs fallback.
- Added accessibility coverage for the new Help menu items.
- Updated usage docs to mention the Help menu.

### Privacy Notes

No raw logs or session content were added. This change only affects native menu behavior and documentation.

### Verification

- Ran `npm run check:mac-accessibility`.
- Ran `npm run build:mac`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Opened `Help > Codex Log Viewer Help` in the packaged app and confirmed it shows the new help panel.

## 2026-05-19 - Align date range popover fields

Status: Completed
Related commit/PR: TBD

### User Messages

> We designed this better so that the date fields are aligned

### Interpreted Intent

The user wanted the Activity Range popover to feel more deliberate, with Start and End date controls aligned in a clean form layout.

### Response / Work Done

- Reworked the Activity Range popover rows to use a fixed label column and aligned control column.
- Hid redundant DatePicker labels inside the controls so custom Start and End date fields line up exactly.
- Indented helper text under the control column to reduce visual clutter.

### Privacy Notes

No raw logs or session content were added. This change only affects native layout.

### Verification

- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Opened the Activity Range popover and visually checked the aligned custom date fields.

## 2026-05-19 - Apply operational filters consistently and isolate tabs

Status: Completed
Related commit/PR: TBD

### User Messages

> Let's fix these two P2s and operational messages do not apply to the search section
>
> P2: Operational filters do not apply when Sessions are shown.
> View > Operational Messages filters model.browseMessages, but the Messages column switches to raw session messages when Show Sessions is on. So unchecking Git commands, Run app, or Code review has no effect in that mode. See RootView.swift (line 530) and RootView.swift (line 542); the actual filter only lives in AppModel.swift (line 991).
>
> P2: New tabs share the same app state, so they are duplicate mirrors.
> AppModel is owned once at the app level and injected into every WindowGroup instance. If the user creates a second tab, changing project/date/message/filter in one tab changes the other too. That makes the tab feature feel native visually but not functionally useful. See CodexLogViewerApp.swift (line 9), CodexLogViewerApp.swift (line 17), and CodexLogViewerApp.swift (line 33).
>
> Open Question
> Should View > Operational Messages also filter the Search section, or only Browse and repeated prompts? Right now Search still returns operational messages.

### Interpreted Intent

The user wanted the operational-message filters to apply everywhere users encounter submitted messages, and wanted native tabs to be useful instead of mirrored copies of the same state.

### Response / Work Done

- Added shared operational category metadata for session detail messages so session-mode Browse can filter `Git commands`, `Run app`, and `Code review`.
- Applied operational filters to Search through the local API and kept the native Search selection in sync when filters hide the selected result.
- Updated Browse session-mode empty states and footer counts to distinguish hidden operational messages from truly empty sessions.
- Moved `AppModel` ownership into each native window/tab and routed menu commands through the focused tab's model.
- Updated usage docs to describe consistent operational filtering and independent tab state.
- Added analytics and server tests for hidden operational categories and session-detail category metadata.

### Privacy Notes

No raw logs or unsanitized session content were added. New fixtures use synthetic local paths and short synthetic prompts.

### Verification

- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Queried the packaged app menus to confirm focused-window `View` and `Logs` commands were present after the per-tab model refactor.

## 2026-05-19 - Prevent future date filters

Status: Completed
Related commit/PR: TBD

### User Messages

> Also make sure I can not pick a date in the future

### Interpreted Intent

The user wanted the Activity Range filter to prevent future dates, both in the date controls and in computed day/week/month/year ranges.

### Response / Work Done

- Limited Activity Range date pickers to today or earlier.
- Clamped saved and programmatic date-filter state to today so stale future values cannot persist.
- Capped week, month, and year ranges at today when the selected period includes future days.
- Updated usage docs to explain that future dates are disabled.

### Privacy Notes

No raw logs or session content were added. This change only affects native date filtering behavior.

### Verification

- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Move browse column status to footer

Status: Completed
Related commit/PR: TBD

### User Messages

> I think we need to move this status to the bottom and make it smaller with maybe a gray bar - Act as a principal designer and figure out the best way to do this

### Interpreted Intent

The user wanted the Browse column status headers to stop competing with the primary message and interaction content, while keeping useful counts visible in a quieter form.

### Response / Work Done

- Replaced the large top column headers in Browse with compact bottom status bars.
- Applied the smaller gray status treatment consistently to Sessions, Messages, and Codex Interaction columns.
- Updated interaction count copy to use compact pluralized text such as `8 responses · 179 tools`.

### Privacy Notes

No raw logs or session content were added. This change only affects native Browse layout.

### Verification

- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Visually checked the Browse footer status bars in the relaunched app.

## 2026-05-19 - Move toolbar utilities into menus

Status: Completed
Related commit/PR: TBD

### User Messages

> I think we can move these options to the app menu system
>
> Reclaim some of this screen real estate

### Interpreted Intent

The user wanted the top-right toolbar utility cluster removed so the window chrome feels lighter and the app relies on native menus for less-frequent actions.

### Response / Work Done

- Removed the Export JSON, Export CSV, and Ready status cluster from the primary toolbar.
- Kept export actions in the native `Logs` menu and added menu accessibility identifiers for them.
- Added a disabled `Logs > Status: ...` menu item so app status remains available without occupying toolbar space.
- Updated usage docs to describe exports as menu commands.

### Privacy Notes

No raw logs or session content were added. This change only affects native app command placement.

### Verification

- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Visually checked that the top-right toolbar utility cluster was removed.

## 2026-05-19 - Refine operational repeated-prompt grouping

Status: Completed
Related commit/PR: TBD

### User Messages

> In the overview tab it is clear that we are not grouping things quite correctly
>
> Commands like execute and do that are basically plan approvals
>
> Commands like publish are git commands, like push to main or to origin
>
> Deploy to production is another git command like publish
>
> Take a look at the messages and make sure that we're grouping them together

### Interpreted Intent

The user wanted the Overview repeated-prompt grouping to treat short approval commands and short publish/deploy requests as operational families instead of showing them as standalone repeated prompts.

### Response / Work Done

- Grouped short approval commands such as `execute`, `do that`, and `execute the plan` under `Plan approvals`.
- Grouped short publish/deploy commands such as `publish`, `publish to origin`, and `deploy to production` under `Git commands`.
- Added `Plan approvals` to the native `View > Operational Messages` menu so approval prompts can be hidden with the other operational families across Browse, Search, and repeated prompts.
- Updated usage docs and analytics tests for the expanded grouping rules.

### Privacy Notes

No raw logs or unsanitized session content were added. New tests use synthetic prompt fixtures based on the user-provided examples.

### Verification

- Ran `npm run test -w @codex-log-viewer/analytics`.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app.
- Ran `npm test`.
- Ran `npm run lint`.
- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run privacy:scan`.
- Ran `npm run package:mac`.
- Ran `npm run smoke:mac-ui`.
- Relaunched the packaged macOS app.

## 2026-05-19 - Tighten Project Focus classifier accuracy

Status: Completed
Related commit/PR: TBD

### User Messages

> Well we have one major problem: 49.7% of my messages are not categorized at all. They got categorized as other. Obviously this is not acceptable. Can you take a step back and re-evaluate what the classifier is doing so we can classify this more correctly?

### Interpreted Intent

The user wanted the Project Focus classifier re-evaluated against real prompt patterns because the `Other` bucket was far too large to be useful.

### Response / Work Done

- Audited uncategorized prompt patterns locally using aggregate counts only.
- Removed over-strict length limits that caused long prompts with clear intent to fall through to `Other`.
- Added missing Project Focus categories for `Implementation`, `Planning/strategy`, `Content creation`, `Data/metrics`, and `Feedback/context`.
- Expanded classifier rules for broad action requests, status/context notes, decision prompts, typo-tolerant Git checks, UI follow-ups, and approval variants.
- Reduced the local all-project `Other` share from 49.7% to 0.2%, with residual conversational/status prompts now represented as `Feedback/context`.
- Updated usage docs and regression tests for the expanded taxonomy.

### Privacy Notes

No raw logs or unsanitized session content were added. The local audit used aggregate category and pattern counts only.

### Verification

- Ran `npm run test -w @codex-log-viewer/analytics`.
- Ran `npm run lint`.
- Ran `npm test`.
- Ran `npm run build:mac`.
- Ran `npm run check:mac-accessibility`.
- Ran `npm run package:mac`.
- Relaunched the packaged macOS app.
- Queried the running app menu and confirmed `View > Operational Messages` includes `Plan approvals`.
- Ran `npm run privacy:scan`.

## 2026-05-19 - Build Project Focus Summary

Status: Completed
Related commit/PR: TBD

### User Messages

> What is this plan called?

> /goal execute project focus summary to its fullest. Make sure all test cases are done. Make sure the UI is beautifully designed and expertly coded. Make sure that our classifiers are accurate. Really really focus on accuracy and provide a way to visualize this maybe with text and pie charts.

### Interpreted Intent

The user wanted the Overview repeated-prompt card replaced with a polished Project Focus summary that accurately classifies submitted prompts by work type and visualizes the category mix.

### Response / Work Done

- Added a deterministic local prompt-intent classifier for `Feature design`, `Bug fixes`, `Git commands`, `Deploy/release`, `Run/build app`, `Code review/QA`, `Research`, `Documentation`, `Testing/verification`, `Refactor/cleanup`, `Plan approvals`, and `Other`.
- Added `promptIntents` to project summaries with counts, percentages, session counts, projects, and representative local examples.
- Redacted Project Focus examples in redacted exports and added Project Focus counts to CSV and CLI summary output.
- Replaced the Overview repeated-prompt card with a native Project Focus card containing a donut chart, color-coded category rows, percentages, and representative examples.
- Updated native help, usage docs, and accessibility checks for the new Project Focus view.
- Added analytics tests that cover every classifier category, date-filter behavior, release-vs-git overlap, approval prompts, and redacted examples.

### Privacy Notes

No raw logs or unsanitized session content were added. Classifier tests use synthetic prompt fixtures, and redacted exports replace Project Focus examples with `[redacted]`.

### Verification

- Ran `npm run test -w @codex-log-viewer/analytics`.

## 2026-05-20 - Prepare Repository Sharing Details

Status: Completed
Related commit/PR: TBD

### User Messages

> Give me the details so I can share the GitHub repository as part of my open source

### Interpreted Intent

The user wanted concise, public-facing repository details that can be used to share Codex Log Viewer as an open source project.

### Response / Work Done

- Reviewed the local README, package metadata, license, security policy, contributing guide, changelog, and open source readiness notes.
- Verified the GitHub repository URL, visibility, description, default branch, license, and topics through the GitHub CLI.
- Prepared share-ready repository details and short announcement copy without exposing private logs or local session data.

### Privacy Notes

No raw logs, private session content, secrets, or unsanitized local Codex data were read or added.

### Verification

- Confirmed the repository is public at `https://github.com/crispierry/codex-log-viewer`.
- Confirmed the repository uses the MIT License and has privacy/security contribution guidance.
