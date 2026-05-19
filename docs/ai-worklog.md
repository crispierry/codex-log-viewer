# AI Worklog

Sanitized audit trail of AI-assisted work on this project.

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
