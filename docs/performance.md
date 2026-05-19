# Performance Notes

Codex Log Viewer keeps a local parsed-session cache so normal navigation does not repeatedly reprocess every Codex log file. Message search is still in-memory and scan-based over the loaded parsed corpus; SQLite FTS5 remains the next step if very large histories make text search itself too slow.

## Local Parsed Cache

The native macOS app stores parsed session records under:

```text
~/Library/Application Support/Codex Log Viewer/Cache/v1
```

The cache is local-only and is not part of exports. It stores derived parsed records, including message text needed for session details and search, but it does not store raw JSONL lines. Treat the cache as private local app data.

Cache invalidation is based on canonical file path, file size, modification time, parser cache version, and cache schema version. On startup and Refresh, unchanged files are reused, new or changed files are parsed, and deleted files are removed from the active corpus.

`Refresh` performs an incremental check. `Rebuild Local Cache` clears cache entries for the active source set and reparses the visible log files.

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

## Search Indexing Trigger

Move search to a local SQLite FTS5 index when real or synthetic histories regularly exceed the benchmark budget, or when app scans/searches make the UI feel blocked on ordinary hardware.

The future index should live under Application Support beside the parsed cache, be keyed by source path plus file size and modification time, and never be committed.
