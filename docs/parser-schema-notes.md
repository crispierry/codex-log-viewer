# Parser Schema Notes

These notes describe observed provider log shapes. They are not official provider schemas.

## Known File Locations

- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- `~/.codex/archived_sessions/rollout-*.jsonl`
- user-provided JSONL files or directories
- Claude Code JSONL files such as `~/.claude/projects/**/*.jsonl`
- Cursor local SQLite state files such as `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` when explicitly selected
- explicit Cursor Markdown export files

## Provider Metadata

Normalized records carry:

- `provider`: `codex`, `claude`, `cursor`, or a future provider id
- `inputKind`: source format such as `codex-jsonl`, `claude-jsonl`, `cursor-vscdb`, or `cursor-markdown`
- `sourceLabel`: display label for the source
- optional `title`
- optional `providerConversationId`

## Top-Level Shape

Observed records generally include:

```json
{
  "timestamp": "2026-04-27T19:01:00.745Z",
  "type": "event_msg",
  "payload": {}
}
```

Some records use `type` values such as `session_meta`, `turn_context`, `event_msg`, and `response_item`.

## Important Event Types

### `session_meta`

Useful fields:

- `payload.id`
- `payload.timestamp`
- `payload.cwd`
- `payload.originator`
- `payload.cli_version`
- `payload.source`
- `payload.model_provider`

Use for session identity and project attribution.

### `turn_context`

Useful fields:

- `payload.turn_id`
- `payload.cwd`
- `payload.current_date`
- `payload.timezone`
- `payload.model`
- `payload.effort`
- `payload.collaboration_mode`
- `payload.approval_policy`
- `payload.sandbox_policy`

Use for turn identity, model tracking, reasoning effort, and per-turn project attribution.

### `event_msg.user_message`

Useful fields:

- `payload.message`
- `payload.images`
- `payload.local_images`
- `payload.text_elements`

Primary source for user-message counts.

### `event_msg.agent_message`

Useful fields:

- `payload.message`
- `payload.phase`
- `payload.memory_citation`

Useful for transcript and final-answer counts.

### `event_msg.token_count`

Useful fields:

- `payload.info.total_token_usage`
- `payload.info.last_token_usage`
- `payload.info.model_context_window`
- `payload.rate_limits`

Important caveat: `payload.info` can be `null`. These events should not be counted as token usage, but their rate-limit data may still be useful.

Token fields observed:

- `input_tokens`
- `cached_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`

Derived field:

- fresh input tokens = `input_tokens - cached_input_tokens`

### `event_msg.task_started`

Useful fields:

- `payload.turn_id`
- `payload.started_at`
- `payload.model_context_window`
- `payload.collaboration_mode_kind`

### `event_msg.task_complete`

Useful fields:

- `payload.turn_id`
- `payload.completed_at`
- `payload.duration_ms`
- `payload.time_to_first_token_ms`
- `payload.last_agent_message`

### `response_item.message`

Useful fields:

- `payload.role`
- `payload.content`
- `payload.phase`

This can be used as a fallback/audit source for user and assistant messages.

### Tool Events

Observed tool-related records include:

- `response_item.function_call`
- `response_item.function_call_output`
- `response_item.custom_tool_call`
- `response_item.custom_tool_call_output`
- `event_msg.exec_command_end`
- `event_msg.patch_apply_end`

These are not required for MVP usage metrics, but they are useful for raw event inspection and future workflow analytics.

For native interaction reconstruction, normalized message, token, and tool-event records preserve their source JSONL line number. Tool-event records also preserve short textual content when the event exposes `output`, `content`, or `arguments`.

## Normalized Records

Initial normalized record types:

- `SessionRecord`
- `TurnRecord`
- `MessageRecord`
- `TokenUsageRecord`
- `TaskTimingRecord`
- `ToolEventRecord`
- `UnknownEventRecord`
- `ParseWarning`

## Claude Code Notes

- Top-level `user` records with text blocks become submitted user messages.
- Top-level `assistant` records become assistant messages.
- `tool_use` and `tool_result` content blocks become tool events.
- `message.usage` maps to token usage, including `cache_creation_input_tokens` and `cache_read_input_tokens`.
- Attachments, queue operations, future records, malformed lines, and unsupported shapes are preserved as unknown events or warnings.

## Cursor Notes

Cursor's public docs describe regular Agent chat history as local SQLite data and provide Markdown export as the preservation path. The local SQLite schema is private and may change, so support is fixture-driven and tolerant rather than a claim of complete schema coverage.

- Local `state.vscdb` imports read `cursorDiskKV` keys shaped like `bubbleId:<composerId>:<bubbleId>`.
- `composer.composerHeaders` records provide optional session title, created/updated timestamps, and workspace id metadata.
- When a sibling `workspaceStorage/<workspace-id>/workspace.json` file is available, the parser maps Cursor sessions to a working directory.
- Bubble type `1` becomes `cursor.user_message`; bubble type `2` becomes `cursor.assistant_message`.
- Bubble `tokenCount.inputTokens` and `tokenCount.outputTokens` map to token usage when nonzero.
- Bubble `toolResults` entries become tool events when present.
- Unsupported bubble types with text are preserved as unknown events. Malformed bubble JSON and unsupported SQLite shapes become parse warnings.
- Markdown export imports are best-effort and require recognizable user/assistant role headings or inline labels.

## Aggregation Rules

- Count submitted user messages from provider-specific submitted-message records.
- Keep Codex Project Focus and Codex-specific metrics scoped to Codex records unless another provider exposes trustworthy equivalent data.
- Generate audit worklogs from provider-specific submitted user-message records and captured assistant responses across enabled providers.
- Use `response_item.message` with `role=user` as a fallback or audit path.
- Aggregate per-turn tokens from `last_token_usage` when present.
- Use cumulative `total_token_usage` for reconciliation, not as the primary sum.
- Ignore token usage for `token_count` events with `info: null`.
- Preserve unknown event metadata and include counts in parser summaries. Bound raw unknown-event previews so large binary/image payloads cannot overwhelm local caches.
- Treat image-generation call and completion payloads as tool events while omitting generated image data from normalized records.
- Use normalized line numbers and turn ids to reconstruct the AI interaction that follows a selected submitted user message.

## Schema Change Policy

When a new event shape appears:

1. Add a sanitized fixture.
2. Add a parser test.
3. Update these notes.
4. Keep the parser tolerant if fields are missing.
