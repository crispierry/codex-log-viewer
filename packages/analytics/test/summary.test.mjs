import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexCorpus } from "@codex-log-viewer/parser";
import { searchMessages, summarizeParsedCorpus } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

test("summarizeParsedCorpus aggregates messages, unique messages, tokens, models, and warnings", async () => {
  const corpus = await parseCodexCorpus({ paths: [fixturePath] });
  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });

  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.totals.userMessages, 1);
  assert.equal(summary.totals.uniqueUserMessages, 1);
  assert.equal(summary.tokens.totalTokens, 17277);
  assert.equal(summary.tokens.freshInputTokens, 10280);
  assert.equal(summary.models[0]?.model, "gpt-5.5");
  assert.equal(summary.totals.unknownEvents, 1);
  assert.equal(summary.totals.parseWarnings, 1);
  assert.equal(summary.messagesByDay[0]?.count, 1);
});

test("searchMessages searches messages across all projects and supports project filtering", async () => {
  const corpus = await parseCodexCorpus({ paths: [fixturePath] });

  const allResults = searchMessages(corpus, { query: "parser test" });
  assert.equal(allResults.totalMatches, 2);
  assert.equal(allResults.results[0]?.project, "sample-app");

  const userResults = searchMessages(corpus, { query: "parser test", role: "user" });
  assert.equal(userResults.totalMatches, 1);
  assert.equal(userResults.results[0]?.role, "user");

  const filteredResults = searchMessages(corpus, {
    query: "parser test",
    project: "other-project"
  });
  assert.equal(filteredResults.totalMatches, 0);
});

test("searchMessages anchors snippets for whitespace-normalized message matches", () => {
  const corpus = {
    files: [],
    sessions: [{ filePath: "fixture.jsonl", sessionId: "session-1", cwd: "/tmp/sample-app" }],
    turns: [],
    messages: [
      {
        filePath: "fixture.jsonl",
        sessionId: "session-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: `${"prefix ".repeat(30)}needle\n\nphrase tail`,
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const result = searchMessages(corpus, { query: "needle phrase" });

  assert.equal(result.totalMatches, 1);
  assert.match(result.results[0]?.id ?? "", /session-1/);
  assert.match(result.results[0]?.snippet ?? "", /needle\n\nphrase/);
  assert.equal(result.results[0]?.snippet.startsWith("..."), true);
});

test("summarizeParsedCorpus filters session list and session total by date range", () => {
  const corpus = {
    files: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-03T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "old message",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        timestamp: "2026-01-03T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "new message",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app", since: "2026-01-02" });

  assert.equal(summary.totals.sessions, 1);
  assert.deepEqual(summary.sessions.map((session) => session.sessionId), ["new-session"]);
  assert.equal(summary.totals.userMessages, 1);
});
