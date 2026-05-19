# AI Worklog

Sanitized audit trail of AI-assisted work on this project.

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
