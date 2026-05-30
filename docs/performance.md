# Performance Notes

Codex Log Viewer keeps a local parsed-session cache so normal navigation does not repeatedly reprocess every Codex log file. The local server also maintains a private SQLite FTS5 message index beside the parsed cache so message browsing and text search can page through large histories without shipping every message to the native UI at once. The Browse and Evals message lists both use bounded pages so large local histories remain navigable.

## Interaction Navigation Plan

The interaction pane should feel local-first: selecting a message should usually be a memory lookup, not a full analytics pass. Target budgets:

- Same loaded session: under 150 ms.
- Different already-cached session: under 300 ms.
- Different cold session from local parsed cache: under 750 ms.
- Initial cache refresh for very large histories: visible progress, cancellable, and not blocking already-loaded browsing.

Implemented staged work:

1. Keep loaded session details hot while navigating. Message selection reuses the current parsed session when the target message is in the same log file, and the native model stores the selected interaction so SwiftUI does not rebuild it repeatedly during one render pass.
2. Make session detail lookup direct. `/api/session` validates the requested session against project/date filters without recomputing the full project summary before returning one session.
3. Reduce local bridge overhead. API JSON responses are compact, and empty-query browse snippets skip unnecessary normalized-search work.
4. Add timing instrumentation. Server responses include local-only timings for corpus load, summary, browse/search, and session detail. The native app records click-to-render timings for interaction navigation to stdout and the app model.
5. Introduce a bounded session-detail LRU. The native app caches the 12 most recently opened session details, invalidates the cache on log refresh/source changes, and prefetches the next likely session from the visible message list.
6. Paginate browse results. Project browse loads submitted messages in 500-row pages with a `Load More` row instead of shipping every submitted message to SwiftUI at once.
7. Move message search and browse indexes to SQLite. The local server writes a private SQLite FTS5 index under the app cache for large histories, keyed by the active source set and parsed corpus fingerprint, and falls back to the original in-memory search for smaller or stale indexes.
8. Keep rendering incremental. Heavy interaction lists use lazy stacks, collapsed system/tool context remains behind disclosure groups, and very large message cards are collapsed until explicitly expanded.
9. Keep Evals review responsive. Evals messages load in 500-row pages with append-only `Load More`, the Evals window reuses an already-loaded page when reopened, review saves preserve the loaded page span, the API reports local Evals timing, and very large reviewed prompts render as a collapsed preview until expanded.

## Local Parsed Cache

The native macOS app stores parsed session records under:

```text
~/Library/Application Support/Codex Log Viewer/Cache/v1
```

The SQLite message index is stored below the same cache root:

```text
~/Library/Application Support/Codex Log Viewer/Cache/v1/search-index-v1
```

The cache and index are local-only and are not part of exports. They store derived parsed records, including message text needed for session details and search, but they do not store raw JSONL lines. Treat them as private local app data.

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

## Search Indexing

Search and project-message browsing use the local SQLite FTS5 index when a cache directory is configured. Unsupported query shapes fall back to the in-memory analytics search so correctness remains the priority. The index is rebuilt from parsed cache data when the active source fingerprint changes, and it must never be committed.
