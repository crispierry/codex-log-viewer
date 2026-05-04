# Usage

## Install From Source

```sh
git clone https://github.com/crispierry/codex-log-viewer.git
cd codex-log-viewer
npm install
npm run build
```

## List Projects

```sh
npm run cli -- projects
```

## Summarize A Project

```sh
npm run cli -- summary --project WBD-Celebration --since 2026-04-22 --until 2026-04-29
```

## Export Data

```sh
npm run cli -- export --format json --output usage.json --project WBD-Celebration
npm run cli -- export --format csv --output usage.csv --project WBD-Celebration
```

## Run Dashboard

```sh
npm run serve
```

Then open [http://127.0.0.1:3210](http://127.0.0.1:3210).

## Scan A Specific Path

```sh
npm run cli -- summary --path fixtures/codex/sample-session.jsonl
```

You can pass multiple `--path` values.

## Current Metric Rules

- User-message counts come from `event_msg.user_message`.
- Unique user messages are trimmed, whitespace-collapsed, and lowercased.
- Token totals sum `token_count.info.last_token_usage` records.
- `token_count` events with `info: null` are ignored for token totals.
- Unknown event shapes are preserved and counted.
- Malformed JSONL lines produce parse warnings instead of aborting the scan.
