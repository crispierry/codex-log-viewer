# AI Audit Trail

Codex Log Viewer can generate a Markdown audit trail from local AI system logs. The goal is to preserve user intent across projects without committing raw private session files.

## Recommended Files

Use two layers when applying this to GitHub repositories:

- `docs/ai-worklog.md`: committed, reviewed, sanitized audit trail.
- `.codex/audit/`: optional local-only raw drafts or transcripts, ignored by git.

The committed worklog should preserve every work-directing user message whenever it is safe to do so. Summaries are useful, but they should not replace the user's actual request.

## What To Capture

Each worklog entry should include:

- user messages, verbatim or minimally redacted
- interpreted intent
- AI response or work performed
- files or areas changed
- verification run
- follow-ups or known gaps
- privacy notes when content was redacted

## Generate A Draft

Use the macOS app's Audit section to generate a smart-merged preview for a repository, review or edit the Markdown, and approve the final write to `docs/ai-worklog.md`.

The CLI can also generate an audit draft for a repository:

```sh
npm run cli -- audit --repo /path/to/repo --output /path/to/repo/docs/ai-worklog.md
```

By default, the audit command scans the selected local sources, filters sessions for the repository when repository context is available, includes submitted user messages from Codex, Claude Code, and Cursor, and writes public-mode Markdown. Captured AI responses are included by default. Public mode preserves intent while redacting obvious local home paths, email addresses, and token-like strings.

Use `--provider all|codex|claude|cursor` and `--path` to control which local AI sources contribute to the audit draft.

Smart merge mode preserves existing reviewed Markdown and appends only generated session sections that are not already present in the target worklog.

Use raw mode only for private local review:

```sh
npm run cli -- audit --repo /path/to/repo --raw --output .codex/audit/raw-ai-worklog.md
```

Suppress AI responses when you only want the user-intent trail:

```sh
npm run cli -- audit --repo /path/to/repo --no-responses
```

## Review Before Commit

Generated audit drafts are not automatically safe to publish. Before committing `docs/ai-worklog.md`, check for:

- secrets, tokens, keys, cookies, and credentials
- private customer or business context
- pasted proprietary source code
- private document text
- screenshots or image references
- local paths that identify private machines or folders

Do not commit raw Codex, Claude Code, or Cursor transcript files. The audit trail should be derived, reviewed, and intentionally sanitized.

## Ongoing Workflow

For new work, update `docs/ai-worklog.md` at the end of each meaningful AI-assisted task. The generated audit command can provide a draft, but the final committed file should be reviewed by a human or by Codex under the repository's privacy rules.
