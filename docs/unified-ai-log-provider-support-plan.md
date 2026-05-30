# Unified AI Log Provider Support

Date: 2026-05-30
Status: Implemented

## Summary

Codex Log Viewer now has a provider-aware parser and analytics surface for local AI logs. Codex remains the default local source, while user-selected files and folders can include Codex JSONL and Claude Code JSONL.

The product model is one local AI log viewer: normalized sessions, messages, tool activity, token usage, warnings, search results, summaries, and native interaction views carry provider metadata and can be filtered by provider.

## Implemented Provider Model

- Normalized records include `provider`, `inputKind`, `sourceLabel`, optional `title`, and optional `providerConversationId`.
- Compatibility APIs such as `parseCodexCorpus`, `parseCodexLogFile`, and `parseCodexCorpusWithCache` remain available.
- Provider-neutral APIs include `parseLogCorpus`, `parseLogFile`, and `parseLogCorpusWithCache`.
- Provider filters are available in analytics, local API query parameters, CLI options, and the macOS workspace header.

## Provider Support

- Codex:
  - Local default remains `~/.codex/sessions` and `~/.codex/archived_sessions`.
  - Existing Codex JSONL parsing, token aggregation, tool events, audit worklog generation, Project Focus, and interaction reconstruction remain compatible.
- Claude Code:
  - Local JSONL records are normalized from user, assistant, system, tool use, tool result, usage, attachment, and unknown record shapes.
  - Anthropic usage fields include separate cache creation and cache read token counts.
  - Tool content blocks become tool events.
## UI And Product Behavior

- Default launch remains Codex-only because no custom sources are selected and the default roots are Codex roots.
- Custom selected files/folders can contain mixed providers.
- The macOS app shows provider badges and a provider segmented control: All, Codex, Claude.
- Mixed-provider interaction surfaces use "AI Interaction" and "AI Response" copy.
- Audit worklog generation uses provider-specific submitted user-message records and captured assistant responses across enabled providers.

## Verification Coverage

- Sanitized fixtures cover Codex compatibility, Claude JSONL, Claude usage/tool records, malformed Claude lines, and mixed-provider corpora.
- Parser tests cover provider normalization, Claude cache tokens, malformed lines, and mixed sources.
- Analytics and API tests cover provider filters, mixed summaries, search, provider metadata, and existing Codex behaviors.
- macOS compile coverage verifies native decoding, provider filter query construction, provider badges, and renamed AI interaction copy.

## Boundaries

- No raw local Codex or Claude transcripts are committed.
- Cloud-backed material enters through explicit local imports or future connectors, not silent authenticated scraping.
- Repository and package names remain unchanged for this milestone.
