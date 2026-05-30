# Optional ChatGPT Message Support

Date: 2026-05-29
Status: Planned

## Summary

Add ChatGPT as an optional local source while keeping Codex as the default experience. The feature should help users search and understand ChatGPT conversations without making the Codex workflow feel like a mixed, ambiguous log bucket.

Desktop-local discovery should be attempted first, but treated as best-effort because the observed ChatGPT desktop data is stored as opaque `.data` cache files rather than a stable JSONL or SQLite log format. ChatGPT export import should be the reliable fallback. OpenAI documents ChatGPT data export, and related help documentation references an export zip containing `conversations.json` among other files:

- [How do I export my ChatGPT history and data?](https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data%23.csv)
- [Transferring Conversations from 1 ChatGPT account to another ChatGPT account](https://help.openai.com/en/articles/9106926-transferring-conversations-between-chatgpt-team-workspaces-and-personal-workspaces%2525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525253F.pls)

## Key Changes

- Extend normalized records with source metadata: `sourceKind: "codex" | "chatgpt"`, `inputKind`, `sourceLabel`, and optional conversation title/id fields.
- Add a ChatGPT parser adapter:
  - Desktop scanner probes `~/Library/Application Support/com.openai.chat` for conversation caches.
  - Opaque or unsupported desktop files produce clear parse warnings, not crashes.
  - Export importer accepts a ChatGPT export zip or `conversations.json`.
  - Each ChatGPT conversation maps to a session; messages map to existing user, assistant, and system roles.
- Update analytics and API filters with `source=codex|chatgpt|all`.
- Keep token, tool, worktree, and audit-worklog features Codex-only unless ChatGPT data provides trustworthy equivalents.
- Update the macOS app with an optional ChatGPT source control, source badges in search/results, and clear unavailable states for Codex-only metrics.

## User Experience

- Default launch remains Codex-only.
- ChatGPT appears only after the user enables desktop-local ChatGPT or imports an export.
- Search can include full local-only ChatGPT message text.
- Browse and Overview can show ChatGPT message counts and timelines, but should avoid pretending ChatGPT conversations are code projects.
- Source labels should make mixed search results obvious without forcing users into a separate app mode.

## Test Plan

- Confirm worktree bootstrap before running repo-local tooling.
- Add sanitized ChatGPT export fixtures and parser tests for conversations, roles, timestamps, malformed items, and missing fields.
- Add desktop-cache probe fixtures for opaque `.data` files and unsupported-format warnings.
- Add analytics tests for source filtering, mixed Codex/ChatGPT summaries, search, and zero-token/no-token behavior.
- Add server and CLI tests for new source flags and import paths.
- Run `npm run privacy:scan`, `npm test`, `npm run lint`, and `npm run build`.
- Rebuild and relaunch the macOS app only when implementation changes affect user-visible behavior. Documentation-only planning changes do not require app relaunch.

## Assumptions

- Desktop-local ChatGPT support is best-effort; export import is the dependable v1 path.
- ChatGPT messages are searchable by default once the source is enabled.
- ChatGPT is excluded from AI audit worklog generation in v1.
- Implementation updates docs, fixtures, privacy notes, and `docs/ai-worklog.md`.
