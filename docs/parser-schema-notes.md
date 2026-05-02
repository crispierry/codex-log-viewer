# Parser Schema Notes

These notes describe observed Codex rollout JSONL shapes. They are not an official OpenAI schema.

## Known File Locations

- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- `~/.codex/archived_sessions/rollout-*.jsonl`
- user-provided JSONL files or directories

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

## Aggregation Rules

- Count submitted user messages from `event_msg.user_message`.
- Use `response_item.message` with `role=user` as a fallback or audit path.
- Aggregate per-turn tokens from `last_token_usage` when present.
- Use cumulative `total_token_usage` for reconciliation, not as the primary sum.
- Ignore token usage for `token_count` events with `info: null`.
- Preserve unknown events and include counts in parser summaries.

## Schema Change Policy

When a new event shape appears:

1. Add a sanitized fixture.
2. Add a parser test.
3. Update these notes.
4. Keep the parser tolerant if fields are missing.
