# Performance Notes

Codex Log Viewer v0.1 uses a scan-based parser and in-memory search. That is intentionally simple while the parser is still evolving.

## Current Benchmark

Run:

```sh
npm run benchmark:search
```

The benchmark builds a synthetic corpus, searches for a known phrase, reports elapsed time, and fails if it exceeds the configured budget.

Defaults:

- `CODEX_LOG_VIEWER_BENCH_SESSIONS=300`
- `CODEX_LOG_VIEWER_BENCH_MESSAGES_PER_SESSION=60`
- `CODEX_LOG_VIEWER_BENCH_SEARCH_BUDGET_MS=1500`

## Indexing Trigger

Move search to a local SQLite FTS5 index when real or synthetic histories regularly exceed the benchmark budget, or when app scans/searches make the UI feel blocked on ordinary hardware.

The future index should live under Application Support, be keyed by source path plus file size and modification time, and never be committed.

