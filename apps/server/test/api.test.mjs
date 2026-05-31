import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { explainPromptIntent } from "@codex-log-viewer/analytics";
import { startServer } from "../dist/index.js";
import { openSearchIndex } from "../dist/search-index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const interactionDetailFixturePath = resolve(testDir, "../../../fixtures/codex/interaction-detail.jsonl");
const claudeFixturePath = resolve(testDir, "../../../fixtures/claude/basic-session.jsonl");
const cursorMarkdownFixturePath = resolve(testDir, "../../../fixtures/cursor/basic-export.md");

test("local API requires bearer token when auth is enabled", async () => {
  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixturePath] });

  try {
    const healthWithoutToken = await fetch(`${server.url}/api/health`);
    assert.equal(healthWithoutToken.status, 401);

    const healthWithToken = await fetch(`${server.url}/api/health`, {
      headers: {
        authorization: "Bearer test-token"
      }
    });
    assert.equal(healthWithToken.status, 200);

    const unauthorized = await fetch(`${server.url}/api/projects`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${server.url}/api/projects`, {
      headers: {
        authorization: "Bearer test-token"
      }
    });
    assert.equal(authorized.status, 200);
    const body = await authorized.json();
    assert.equal(body.projects[0]?.project, "sample-app");
    assert.equal(body.projects[0]?.lastSeen, "2026-04-27T19:01:12.000Z");
  } finally {
    await server.close();
  }
});

test("local API exposes provider filters for mixed sources", async () => {
  const server = await startServer({
    port: 0,
    authToken: "test-token",
    paths: [fixturePath, claudeFixturePath, cursorMarkdownFixturePath]
  });
  const headers = { authorization: "Bearer test-token" };

  try {
    const summary = await fetch(`${server.url}/api/summary?provider=claude`, { headers });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.summary.providers[0]?.provider, "claude");
    assert.equal(summaryBody.summary.totals.userMessages, 1);

    const search = await fetch(`${server.url}/api/messages/search?provider=claude&submittedOnly=true&role=user`, {
      headers
    });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert.equal(searchBody.search.totalMatches, 1);
    assert.equal(searchBody.search.results[0]?.provider, "claude");
    assert.equal(searchBody.search.results[0]?.content, "Add Claude fixture support");

    const cursorSearch = await fetch(`${server.url}/api/messages/search?provider=cursor&submittedOnly=true&role=user`, {
      headers
    });
    assert.equal(cursorSearch.status, 200);
    const cursorSearchBody = await cursorSearch.json();
    assert.equal(cursorSearchBody.search.totalMatches, 1);
    assert.equal(cursorSearchBody.search.results[0]?.provider, "cursor");
    assert.equal(cursorSearchBody.search.results[0]?.content, "Add Cursor Markdown import support.");
  } finally {
    await server.close();
  }
});

test("local API keeps default Codex cache separate from explicit all-provider cache", async () => {
  const tempHome = await mkdtemp(`${tmpdir()}/codex-log-viewer-server-home-`);
  const previousHome = process.env.HOME;
  const headers = { authorization: "Bearer test-token" };

  try {
    const codexRoot = resolve(tempHome, ".codex/sessions");
    const claudeRoot = resolve(tempHome, ".claude/projects/project-a");
    const cacheDir = resolve(tempHome, "cache");
    await mkdir(codexRoot, { recursive: true });
    await mkdir(claudeRoot, { recursive: true });
    await copyFile(fixturePath, resolve(codexRoot, "sample-session.jsonl"));
    await copyFile(claudeFixturePath, resolve(claudeRoot, "basic-session.jsonl"));
    process.env.HOME = tempHome;

    const server = await startServer({ port: 0, authToken: "test-token", cacheDir });
    try {
      const defaultSummary = await fetch(`${server.url}/api/summary`, { headers });
      assert.equal(defaultSummary.status, 200);
      const defaultBody = await defaultSummary.json();
      assert.deepEqual(defaultBody.summary.providers.map((provider) => provider.provider), ["codex"]);

      const allSummary = await fetch(`${server.url}/api/summary?provider=all`, { headers });
      assert.equal(allSummary.status, 200);
      const allBody = await allSummary.json();
      assert.deepEqual(allBody.summary.providers.map((provider) => provider.provider).sort(), ["claude", "codex"]);
      assert.equal(allBody.summary.totals.userMessages, 2);

      const allMessages = await fetch(
        `${server.url}/api/messages/search?provider=all&role=user&submittedOnly=true&limit=1`,
        { headers }
      );
      assert.equal(allMessages.status, 200);
      const allMessagesBody = await allMessages.json();
      assert.equal(allMessagesBody.search.totalMatches, 2);
      assert.equal(allMessagesBody.search.results.length, 1);
      assert(["claude", "codex"].includes(allMessagesBody.search.results[0]?.provider));
    } finally {
      await server.close();
    }
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    await rm(tempHome, { recursive: true, force: true });
  }
});

test("message search supports model and session filters through the local API", async () => {
  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixturePath] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const match = await fetch(
      `${server.url}/api/messages/search?q=parser%20test&model=gpt-5.5&sessionId=sample-session-1`,
      { headers }
    );
    assert.equal(match.status, 200);
    const matchBody = await match.json();
    assert.equal(matchBody.search.totalMatches, 2);
    assert.equal(matchBody.search.results[0]?.model, "gpt-5.5");
    assert.equal(typeof matchBody.performance?.totalMs, "number");
    assert.equal(typeof matchBody.performance?.searchMs, "number");

    const secondPage = await fetch(
      `${server.url}/api/messages/search?q=parser%20test&limit=1&offset=1`,
      { headers }
    );
    assert.equal(secondPage.status, 200);
    const secondPageBody = await secondPage.json();
    assert.equal(secondPageBody.search.totalMatches, 2);
    assert.equal(secondPageBody.search.limit, 1);
    assert.equal(secondPageBody.search.offset, 1);
    assert.equal(secondPageBody.search.results.length, 1);

    const miss = await fetch(`${server.url}/api/messages/search?q=parser%20test&model=gpt-4.1`, { headers });
    assert.equal(miss.status, 200);
    const missBody = await miss.json();
    assert.equal(missBody.search.totalMatches, 0);

    const sentMessages = await fetch(`${server.url}/api/messages/search?role=user&project=sample-app&submittedOnly=true`, {
      headers
    });
    assert.equal(sentMessages.status, 200);
    const sentMessagesBody = await sentMessages.json();
    assert.equal(sentMessagesBody.search.totalMatches, 1);
    assert.equal(sentMessagesBody.search.results[0]?.role, "user");
    assert.match(sentMessagesBody.search.results[0]?.snippet, /parser test/);
    assert.match(sentMessagesBody.search.results[0]?.content, /parser test/);
  } finally {
    await server.close();
  }
});

test("message search can limit browse mode to submitted user messages through the local API", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-submitted-search-`);
  const submittedFixture = resolve(tempDir, "submitted-search.jsonl");

  await writeFile(
    submittedFixture,
    [
      JSON.stringify({
        timestamp: "2026-04-27T20:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "submitted-search-session",
          timestamp: "2026-04-27T20:00:00.000Z",
          cwd: "/Users/example/projects/sample-app"
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: [
            "",
            "# In app browser:",
            "- The user has the in-app browser open.",
            "- Current URL: http://127.0.0.1:5173/projects/sample-app",
            "",
            "## My request for Codex:",
            "Typed prompt"
          ].join("\n")
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:02.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "<goal_context>\nContinue working toward the active thread goal."
            }
          ]
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({ port: 0, authToken: "test-token", paths: [submittedFixture] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const allUserMessages = await fetch(`${server.url}/api/messages/search?role=user`, { headers });
    assert.equal(allUserMessages.status, 200);
    const allUserMessagesBody = await allUserMessages.json();
    assert.equal(allUserMessagesBody.search.totalMatches, 2);

    const submittedMessages = await fetch(`${server.url}/api/messages/search?role=user&submittedOnly=true`, {
      headers
    });
    assert.equal(submittedMessages.status, 200);
    const submittedMessagesBody = await submittedMessages.json();
    assert.equal(submittedMessagesBody.search.totalMatches, 1);
    assert.equal(submittedMessagesBody.search.results[0]?.sourceEvent, "event_msg.user_message");
    assert.equal(submittedMessagesBody.search.results[0]?.snippet, "Typed prompt");
    assert.equal(submittedMessagesBody.search.results[0]?.content, "Typed prompt");
    assert.equal(submittedMessagesBody.search.results[0]?.snippet.includes("# In app browser:"), false);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("message search writes and reads a local SQLite search index when cache is configured", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-search-index-`);
  const cacheDir = resolve(tempDir, "cache");
  const previousMinMessages = process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_MIN_MESSAGES;
  const previousDelayMs = process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_REBUILD_DELAY_MS;
  process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_MIN_MESSAGES = "0";
  process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_REBUILD_DELAY_MS = "0";
  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixturePath], cacheDir });
  const headers = { authorization: "Bearer test-token" };

  try {
    const search = await fetch(`${server.url}/api/messages/search?q=parser%20test&limit=1&offset=1`, { headers });
    assert.equal(search.status, 200);
    const body = await search.json();
    assert.equal(body.search.totalMatches, 2);
    assert.equal(body.search.offset, 1);
    assert.equal(body.search.results.length, 1);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    const indexFiles = await readdir(resolve(cacheDir, "search-index-v1"));
    assert.equal(indexFiles.some((file) => file.endsWith(".sqlite")), true);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
    if (previousMinMessages === undefined) {
      delete process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_MIN_MESSAGES;
    } else {
      process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_MIN_MESSAGES = previousMinMessages;
    }
    if (previousDelayMs === undefined) {
      delete process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_REBUILD_DELAY_MS;
    } else {
      process.env.CODEX_LOG_VIEWER_SEARCH_INDEX_REBUILD_DELAY_MS = previousDelayMs;
    }
  }
});

test("message search index rebuilds stale v2 schemas", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-search-index-migration-`);
  const indexPath = resolve(tempDir, "messages.sqlite");
  const database = new DatabaseSync(indexPath);
  database.exec(`
    CREATE TABLE metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO metadata (key, value) VALUES ('schemaVersion', '2');
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      date_key TEXT NOT NULL,
      project TEXT NOT NULL,
      cwd TEXT,
      line_number INTEGER,
      turn_id TEXT,
      model TEXT,
      timestamp TEXT,
      role TEXT NOT NULL,
      source_event TEXT NOT NULL,
      category TEXT,
      prompt_intent_key TEXT,
      prompt_intent TEXT,
      normalized_content TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE messages_fts
      USING fts5(content, content='messages', content_rowid='rowid');
  `);
  database.close();

  try {
    const handle = openSearchIndex(searchIndexCorpus(), indexPath);
    const result = handle.search({ submittedOnly: true });
    handle.close();

    assert.equal(result?.totalMatches, 1);
    assert.equal(result?.results[0]?.provider, "codex");
    assert.equal(result?.results[0]?.content, "Upgrade stale index");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("message search and session detail expose operational prompt categories", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-operational-categories-`);
  const fixture = resolve(tempDir, "operational-categories.jsonl");

  await writeFile(
    fixture,
    [
      JSON.stringify({
        timestamp: "2026-04-27T20:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "operational-categories-session",
          timestamp: "2026-04-27T20:00:00.000Z",
          cwd: "/Users/example/projects/sample-app"
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "commit"
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "make the sidebar clearer"
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixture] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const search = await fetch(`${server.url}/api/messages/search?role=user&submittedOnly=true`, { headers });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert.equal(searchBody.search.results.find((message) => message.content === "commit")?.category, "Git commands");
    assert.equal(searchBody.search.results.find((message) => message.content === "commit")?.promptIntent, "Git commands");
    assert.equal(
      searchBody.search.results.find((message) => message.content === "make the sidebar clearer")?.promptIntent,
      "Implementation"
    );

    const filteredSearch = await fetch(
      `${server.url}/api/messages/search?role=user&submittedOnly=true&hiddenCategory=${encodeURIComponent("Git commands")}`,
      { headers }
    );
    assert.equal(filteredSearch.status, 200);
    const filteredSearchBody = await filteredSearch.json();
    assert.equal(filteredSearchBody.search.totalMatches, 1);
    assert.equal(filteredSearchBody.search.results[0]?.content, "make the sidebar clearer");

    const summary = await fetch(`${server.url}/api/summary?project=sample-app`, { headers });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.summary.promptIntents.totalMessages, 2);
    assert.equal(
      summaryBody.summary.promptIntents.buckets.find((bucket) => bucket.label === "Git commands")?.count,
      1
    );

    const detail = await fetch(`${server.url}/api/session?sessionId=operational-categories-session`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.messages.find((message) => message.content === "commit")?.category, "Git commands");
    assert.equal(detailBody.messages.find((message) => message.content === "commit")?.promptIntent, "Git commands");
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evals API exposes submitted messages with explanations, filters, pagination, and reviews", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-evals-api-`);
  const fixture = resolve(tempDir, "evals.jsonl");
  const evalsDir = resolve(tempDir, "evals");
  const featureMessage = "Please add a loading indicator because the app feels broken";
  const bugMessage = "Can we fix the broken loading dialog?";

  await mkdir(evalsDir, { recursive: true });
  await writeFile(
    fixture,
    [
      JSON.stringify({
        timestamp: "2026-04-27T20:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "evals-session",
          timestamp: "2026-04-27T20:00:00.000Z",
          cwd: "/Users/example/projects/sample-app"
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: featureMessage
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: bugMessage
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:03.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Internal user context, not submitted" }]
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixture], evalsDir });
  const headers = { authorization: "Bearer test-token" };

  try {
    const all = await fetch(`${server.url}/api/evals/messages`, { headers });
    assert.equal(all.status, 200);
    const allBody = await all.json();
    assert.equal(allBody.evals.totalMatches, 2);
    assert.equal(allBody.evals.summary.totalMessages, 2);
    assert.equal(typeof allBody.performance?.totalMs, "number");
    assert.equal(typeof allBody.performance?.evalsMs, "number");
    assert.equal(allBody.evals.results.some((message) => message.content.includes("Internal user context")), false);

    const feature = allBody.evals.results.find((message) => message.content === featureMessage);
    assert.ok(feature);
    const featureExplanation = explainPromptIntent(featureMessage);
    assert.equal(feature.promptIntentKey, "feature-design");
    assert.equal(feature.ruleKey, featureExplanation.ruleKey);
    assert.equal(feature.ruleLabel, featureExplanation.ruleLabel);
    assert.deepEqual(feature.signals, featureExplanation.signals);

    const filtered = await fetch(`${server.url}/api/evals/messages?categoryKey=feature-design`, { headers });
    assert.equal(filtered.status, 200);
    const filteredBody = await filtered.json();
    assert.equal(filteredBody.evals.totalMatches, 1);
    assert.equal(filteredBody.evals.results[0]?.evalId, feature.evalId);

    const firstPage = await fetch(`${server.url}/api/evals/messages?limit=1&offset=0`, { headers });
    const secondPage = await fetch(`${server.url}/api/evals/messages?limit=1&offset=1`, { headers });
    assert.equal(firstPage.status, 200);
    assert.equal(secondPage.status, 200);
    const firstPageBody = await firstPage.json();
    const secondPageBody = await secondPage.json();
    assert.equal(firstPageBody.evals.totalMatches, 2);
    assert.equal(firstPageBody.evals.results.length, 1);
    assert.equal(secondPageBody.evals.results.length, 1);
    assert.notEqual(firstPageBody.evals.results[0]?.evalId, secondPageBody.evals.results[0]?.evalId);

    const review = await fetch(`${server.url}/api/evals/reviews`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        evalId: feature.evalId,
        actualKey: feature.promptIntentKey,
        expectedKey: feature.promptIntentKey,
        note: "Looks right"
      })
    });
    assert.equal(review.status, 200);
    const reviewBody = await review.json();
    assert.equal(reviewBody.review.isCorrect, true);

    const draft = await fetch(`${server.url}/api/evals/fixture-draft`, { headers });
    assert.equal(draft.status, 200);
    assert.match(draft.headers.get("content-disposition") ?? "", /project-focus-reviewed-fixture-draft\.json/);
    const draftText = await draft.text();
    const draftBody = JSON.parse(draftText);
    assert.equal(draftBody.examples.length, 1);
    assert.equal(draftBody.examples[0]?.expectedKey, "feature-design");
    assert.equal(draftBody.examples[0]?.message.includes("TODO: Replace"), true);
    assert.equal(draftText.includes(featureMessage), false);
    assert.equal(draftText.includes("Looks right"), false);

    const correct = await fetch(`${server.url}/api/evals/messages?reviewState=correct`, { headers });
    const unreviewed = await fetch(`${server.url}/api/evals/messages?reviewState=unreviewed`, { headers });
    assert.equal(correct.status, 200);
    assert.equal(unreviewed.status, 200);
    const correctBody = await correct.json();
    const unreviewedBody = await unreviewed.json();
    assert.equal(correctBody.evals.totalMatches, 1);
    assert.equal(correctBody.evals.results[0]?.evalId, feature.evalId);
    assert.equal(unreviewedBody.evals.totalMatches, 1);
    assert.equal(correctBody.evals.summary.reviewedMessages, 1);
    assert.equal(correctBody.evals.summary.correctMessages, 1);

    const cleared = await fetch(`${server.url}/api/evals/reviews?evalId=${feature.evalId}`, {
      method: "DELETE",
      headers
    });
    assert.equal(cleared.status, 200);

    const afterClear = await fetch(`${server.url}/api/evals/messages?reviewState=unreviewed`, { headers });
    const afterClearBody = await afterClear.json();
    assert.equal(afterClearBody.evals.totalMatches, 2);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session detail exposes ordered interaction records for native reconstruction", async () => {
  const server = await startServer({ port: 0, authToken: "test-token", paths: [interactionDetailFixturePath] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const search = await fetch(`${server.url}/api/messages/search?role=user&submittedOnly=true`, { headers });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    const firstPrompt = searchBody.search.results.find((result) => result.snippet.includes("cache behavior"));
    assert.equal(firstPrompt?.lineNumber, 4);
    assert.equal(firstPrompt?.turnId, "interaction-turn-1");

    const detail = await fetch(`${server.url}/api/session?sessionId=interaction-detail-session`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.messages.find((message) => message.content.includes("cache behavior"))?.lineNumber, 4);
    assert.equal(detailBody.messages.find((message) => message.role === "developer")?.lineNumber, 5);
    assert.equal(detailBody.toolEvents.find((event) => event.eventType === "custom_tool_call")?.lineNumber, 6);
    assert.equal(detailBody.toolEvents.find((event) => event.eventType === "custom_tool_call_output")?.content, "cache status: warm");
    assert.equal(detailBody.toolEvents.find((event) => event.eventType === "exec_command_end")?.exitCode, 0);
    assert.equal(detailBody.tokenUsage[0]?.lineNumber, 10);
    assert.equal(detailBody.tokenUsage[0]?.turnId, "interaction-turn-1");
  } finally {
    await server.close();
  }
});

test("project-scoped endpoints respect the requested project filter", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-export-filter-`);
  const otherProjectFixture = resolve(tempDir, "other-project-session.jsonl");

  await writeFile(
    otherProjectFixture,
    [
      JSON.stringify({
        timestamp: "2026-04-27T20:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "other-session-1",
          timestamp: "2026-04-27T20:00:00.000Z",
          cwd: "/Users/example/projects/other-app"
        }
      }),
      JSON.stringify({
        timestamp: "2026-04-27T20:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Synthetic other project message"
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({
    port: 0,
    authToken: "test-token",
    paths: [fixturePath, otherProjectFixture]
  });
  const headers = { authorization: "Bearer test-token" };

  try {
    const summary = await fetch(`${server.url}/api/summary?project=sample-app`, { headers });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.summary.project, "sample-app");
    assert.equal(summaryBody.summary.totals.sessions, 1);
    assert.equal(summaryBody.summary.sessions.some((session) => session.project === "other-app"), false);

    const sessions = await fetch(`${server.url}/api/sessions?project=sample-app`, { headers });
    assert.equal(sessions.status, 200);
    const sessionsBody = await sessions.json();
    assert.deepEqual(
      sessionsBody.sessions.map((session) => session.project),
      ["sample-app"]
    );

    const hiddenSession = await fetch(`${server.url}/api/session?sessionId=other-session-1&project=sample-app`, {
      headers
    });
    assert.equal(hiddenSession.status, 404);

    const jsonExport = await fetch(`${server.url}/api/export?format=json&project=sample-app`, { headers });
    assert.equal(jsonExport.status, 200);
    const jsonBody = await jsonExport.json();
    assert.equal(jsonBody.project, "sample-app");
    assert.equal(jsonBody.totals.sessions, 1);
    assert.equal(jsonBody.sessions.some((session) => session.project === "other-app"), false);

    const csvExport = await fetch(`${server.url}/api/export?format=csv&project=sample-app`, { headers });
    assert.equal(csvExport.status, 200);
    const csvBody = await csvExport.text();
    assert.match(csvBody, /^project,sample-app$/m);
    assert.equal(csvBody.includes("other-app"), false);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("session detail and message search isolate duplicate session ids by file path", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-duplicate-session-`);
  const alphaFixture = resolve(tempDir, "alpha-duplicate.jsonl");
  const betaFixture = resolve(tempDir, "beta-duplicate.jsonl");

  const fixtureBody = ({ cwd, message, model, timestamp }) =>
    [
      JSON.stringify({
        timestamp,
        type: "session_meta",
        payload: {
          id: "duplicate-session",
          timestamp,
          cwd
        }
      }),
      JSON.stringify({
        timestamp,
        type: "turn_context",
        payload: {
          turn_id: "shared-turn",
          cwd,
          model
        }
      }),
      JSON.stringify({
        timestamp,
        type: "event_msg",
        payload: {
          type: "user_message",
          message
        }
      })
    ].join("\n") + "\n";

  await writeFile(
    alphaFixture,
    fixtureBody({
      cwd: "/Users/example/projects/alpha-app",
      message: "Alpha duplicate message",
      model: "alpha-model",
      timestamp: "2026-04-27T20:00:00.000Z"
    }),
    "utf8"
  );
  await writeFile(
    betaFixture,
    fixtureBody({
      cwd: "/Users/example/projects/beta-app",
      message: "Beta duplicate message",
      model: "beta-model",
      timestamp: "2026-04-27T20:01:00.000Z"
    }),
    "utf8"
  );

  const server = await startServer({
    port: 0,
    authToken: "test-token",
    paths: [alphaFixture, betaFixture]
  });
  const headers = { authorization: "Bearer test-token" };

  try {
    const summary = await fetch(`${server.url}/api/summary?project=beta-app`, { headers });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.summary.totals.sessions, 1);
    assert.equal(summaryBody.summary.sessions[0]?.filePath, betaFixture);

    const visibleParams = new URLSearchParams({
      sessionId: "duplicate-session",
      project: "beta-app",
      filePath: betaFixture
    });
    const detail = await fetch(`${server.url}/api/session?${visibleParams}`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.file.filePath, betaFixture);
    assert.equal(detailBody.messages.some((message) => message.content === "Beta duplicate message"), true);
    assert.equal(detailBody.messages.some((message) => message.content === "Alpha duplicate message"), false);

    const hiddenParams = new URLSearchParams({
      sessionId: "duplicate-session",
      project: "beta-app",
      filePath: alphaFixture
    });
    const hiddenDetail = await fetch(`${server.url}/api/session?${hiddenParams}`, { headers });
    assert.equal(hiddenDetail.status, 404);

    const searchParams = new URLSearchParams({
      q: "duplicate message",
      project: "beta-app",
      model: "beta-model",
      sessionId: "duplicate-session",
      filePath: betaFixture
    });
    const search = await fetch(`${server.url}/api/messages/search?${searchParams}`, { headers });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert.equal(searchBody.search.totalMatches, 1);
    assert.equal(searchBody.search.results[0]?.filePath, betaFixture);

    const hiddenSearchParams = new URLSearchParams({
      q: "duplicate message",
      project: "beta-app",
      sessionId: "duplicate-session",
      filePath: alphaFixture
    });
    const hiddenSearch = await fetch(`${server.url}/api/messages/search?${hiddenSearchParams}`, { headers });
    assert.equal(hiddenSearch.status, 200);
    const hiddenSearchBody = await hiddenSearch.json();
    assert.equal(hiddenSearchBody.search.totalMatches, 0);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("local API exposes daily session slices for sessions that span dates", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-daily-session-`);
  const fixture = resolve(tempDir, "spanning-session.jsonl");

  await writeFile(
    fixture,
    [
      JSON.stringify({
        timestamp: "2026-01-01T12:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "spanning-session",
          timestamp: "2026-01-01T12:00:00.000Z",
          cwd: "/Users/example/projects/daily-app"
        }
      }),
      JSON.stringify({
        timestamp: "2026-01-01T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "First day prompt"
        }
      }),
      JSON.stringify({
        timestamp: "2026-01-02T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Second day prompt"
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixture] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const summary = await fetch(`${server.url}/api/summary?project=daily-app`, { headers });
    assert.equal(summary.status, 200);
    const summaryBody = await summary.json();
    assert.equal(summaryBody.summary.totals.sessions, 2);
    assert.equal(new Set(summaryBody.summary.sessions.map((session) => session.dateKey)).size, 2);

    const firstDay = summaryBody.summary.sessions.find(
      (session) => session.firstSeen === "2026-01-01T12:00:00.000Z"
    );
    assert.equal(firstDay?.userMessages, 1);

    const searchParams = new URLSearchParams({
      q: "day prompt",
      sessionId: "spanning-session",
      filePath: fixture,
      dateKey: firstDay.dateKey
    });
    const search = await fetch(`${server.url}/api/messages/search?${searchParams}`, { headers });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert.equal(searchBody.search.totalMatches, 1);
    assert.equal(searchBody.search.results[0]?.snippet, "First day prompt");
    assert.equal(searchBody.search.results[0]?.dateKey, firstDay.dateKey);

    const detailParams = new URLSearchParams({
      sessionId: "spanning-session",
      filePath: fixture,
      dateKey: firstDay.dateKey
    });
    const detail = await fetch(`${server.url}/api/session?${detailParams}`, { headers });
    assert.equal(detail.status, 200);

    detailParams.set("dateKey", "2099-01-01");
    const hiddenDetail = await fetch(`${server.url}/api/session?${detailParams}`, { headers });
    assert.equal(hiddenDetail.status, 404);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("server reports fixed-port conflicts and dynamic ports avoid them", async () => {
  const first = await startServer({ port: 0 });
  const occupiedPort = Number(new URL(first.url).port);

  try {
    await assert.rejects(() => startServer({ port: occupiedPort }), /EADDRINUSE/);

    const second = await startServer({ port: 0 });
    try {
      assert.notEqual(new URL(second.url).port, String(occupiedPort));
    } finally {
      await second.close();
    }
  } finally {
    await first.close();
  }
});

test("audit endpoints preview smart merges and write approved Markdown", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-audit-api-`);
  const repoPath = resolve(tempDir, "sample-app");
  const fixture = resolve(tempDir, "audit-session.jsonl");
  const claudeFixture = resolve(tempDir, "claude-audit-session.jsonl");

  await mkdir(repoPath, { recursive: true });
  await writeFile(
    fixture,
    [
      JSON.stringify({
        timestamp: "2026-05-19T12:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "audit-api-session",
          timestamp: "2026-05-19T12:00:00.000Z",
          cwd: repoPath
        }
      }),
      JSON.stringify({
        timestamp: "2026-05-19T12:00:01.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Generate the repo audit trail."
        }
      }),
      JSON.stringify({
        timestamp: "2026-05-19T12:00:02.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Prepared the audit preview." }]
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );
  await writeFile(
    claudeFixture,
    [
      JSON.stringify({
        type: "user",
        timestamp: "2026-05-19T12:00:03.000Z",
        sessionId: "claude-audit-api-session",
        uuid: "claude-audit-turn-1",
        cwd: repoPath,
        message: {
          role: "user",
          content: [{ type: "text", text: "Add Claude audit coverage." }]
        }
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-05-19T12:00:04.000Z",
        sessionId: "claude-audit-api-session",
        uuid: "claude-audit-turn-1",
        cwd: repoPath,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Claude audit response included." }]
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );

  const server = await startServer({ port: 0, authToken: "test-token", paths: [fixture, claudeFixture] });
  const headers = { authorization: "Bearer test-token" };

  try {
    const preview = await fetch(`${server.url}/api/audit?repoPath=${encodeURIComponent(repoPath)}`, { headers });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.audit.appendedSections, 2);
    assert.equal(previewBody.audit.targetPath, resolve(repoPath, "docs/ai-worklog.md"));
    assert.match(previewBody.audit.mergedMarkdown, /Providers: Claude Code, Codex/);
    assert.match(previewBody.audit.mergedMarkdown, /Generate the repo audit trail/);
    assert.match(previewBody.audit.mergedMarkdown, /Prepared the audit preview/);
    assert.match(previewBody.audit.mergedMarkdown, /Add Claude audit coverage/);
    assert.match(previewBody.audit.mergedMarkdown, /Claude audit response included/);

    const targetOverride = await fetch(
      `${server.url}/api/audit?repoPath=${encodeURIComponent(repoPath)}&targetPath=${encodeURIComponent(resolve(tempDir, "elsewhere.md"))}`,
      { headers }
    );
    assert.equal(targetOverride.status, 200);
    const targetOverrideBody = await targetOverride.json();
    assert.equal(targetOverrideBody.audit.targetPath, resolve(repoPath, "docs/ai-worklog.md"));

    const approvedMarkdown = `${previewBody.audit.mergedMarkdown}\nReviewed: yes\n`;
    const write = await fetch(`${server.url}/api/audit`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repoPath,
        targetPath: previewBody.audit.targetPath,
        markdown: approvedMarkdown
      })
    });
    assert.equal(write.status, 200);
    assert.equal(await readFile(previewBody.audit.targetPath, "utf8"), approvedMarkdown);

    const duplicatePreview = await fetch(`${server.url}/api/audit?repoPath=${encodeURIComponent(repoPath)}`, { headers });
    assert.equal(duplicatePreview.status, 200);
    const duplicateBody = await duplicatePreview.json();
    assert.equal(duplicateBody.audit.appendedSections, 0);
    assert.equal(duplicateBody.audit.skippedSections, 2);
    assert.match(duplicateBody.audit.mergedMarkdown, /Reviewed: yes/);

    const outsideWrite = await fetch(`${server.url}/api/audit`, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        repoPath,
        targetPath: resolve(tempDir, "outside.md"),
        markdown: "outside"
      })
    });
    assert.equal(outsideWrite.status, 400);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("local API incrementally refreshes the persistent parsed cache", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-api-cache-`);
  const sourceDir = resolve(tempDir, "logs");
  const cacheDir = resolve(tempDir, "cache");
  const sessionA = resolve(sourceDir, "session-a.jsonl");
  const sessionB = resolve(sourceDir, "session-b.jsonl");

  await writeApiSession(sessionA, {
    sessionId: "session-a",
    cwd: "/tmp/cache-api-app",
    timestamp: "2026-01-01T00:00:00.000Z",
    message: "First API cache message"
  });

  const server = await startServer({
    port: 0,
    authToken: "test-token",
    paths: [sourceDir],
    cacheDir
  });
  const headers = { authorization: "Bearer test-token" };

  try {
    const cold = await fetch(`${server.url}/api/summary`, { headers });
    assert.equal(cold.status, 200);
    const coldBody = await cold.json();
    assert.equal(coldBody.cacheStatus, "updated");
    assert.equal(coldBody.parsedFiles, 1);
    assert.equal(coldBody.summary.totals.sessions, 1);
    assert.equal(coldBody.summary.activity.firstSeen, "2026-01-01T00:00:00.000Z");
    assert.equal(coldBody.summary.activity.lastSeen, "2026-01-01T00:00:00.000Z");

    const warm = await fetch(`${server.url}/api/projects`, { headers });
    assert.equal(warm.status, 200);
    const warmBody = await warm.json();
    assert.equal(warmBody.cacheStatus, "ready");
    assert.equal(warmBody.parsedFiles, 0);
    assert.equal(warmBody.reusedFiles, 1);

    await writeApiSession(sessionB, {
      sessionId: "session-b",
      cwd: "/tmp/cache-api-app",
      timestamp: "2026-01-02T00:00:00.000Z",
      message: "Second API cache message"
    });

    const stale = await fetch(`${server.url}/api/summary`, { headers });
    assert.equal(stale.status, 200);
    const staleBody = await stale.json();
    assert.equal(staleBody.cacheStatus, "ready");
    assert.equal(staleBody.summary.totals.sessions, 1);

    const refreshed = await fetch(`${server.url}/api/summary?refresh=1`, { headers });
    assert.equal(refreshed.status, 200);
    const refreshedBody = await refreshed.json();
    assert.equal(refreshedBody.cacheStatus, "updated");
    assert.equal(refreshedBody.reusedFiles, 1);
    assert.equal(refreshedBody.parsedFiles, 1);
    assert.equal(refreshedBody.summary.totals.sessions, 2);
    assert.equal(refreshedBody.summary.activity.lastSeen, "2026-01-02T00:00:00.000Z");

    const search = await fetch(`${server.url}/api/messages/search?q=Second`, { headers });
    assert.equal(search.status, 200);
    const searchBody = await search.json();
    assert.equal(searchBody.cacheStatus, "ready");
    assert.equal(searchBody.search.totalMatches, 1);
    assert.equal(searchBody.search.results[0]?.sessionId, "session-b");

    await unlink(sessionA);
    const removed = await fetch(`${server.url}/api/summary?refresh=2`, { headers });
    assert.equal(removed.status, 200);
    const removedBody = await removed.json();
    assert.equal(removedBody.cacheStatus, "updated");
    assert.equal(removedBody.removedFiles, 1);
    assert.equal(removedBody.summary.totals.sessions, 1);
    assert.equal(removedBody.summary.sessions[0]?.sessionId, "session-b");

    const rebuilt = await fetch(`${server.url}/api/summary?rebuild=1`, { headers });
    assert.equal(rebuilt.status, 200);
    const rebuiltBody = await rebuilt.json();
    assert.equal(rebuiltBody.cacheStatus, "rebuilt");
    assert.equal(rebuiltBody.parsedFiles, 1);
    assert.equal(rebuiltBody.reusedFiles, 0);
    assert.equal(rebuiltBody.summary.totals.sessions, 1);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeApiSession(filePath, { sessionId, cwd, timestamp, message }) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    [
      JSON.stringify({
        timestamp,
        type: "session_meta",
        payload: {
          id: sessionId,
          timestamp,
          cwd
        }
      }),
      JSON.stringify({
        timestamp,
        type: "event_msg",
        payload: {
          type: "user_message",
          message
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );
}

function searchIndexCorpus() {
  const file = {
    provider: "codex",
    sourceLabel: "Codex",
    inputKind: "codex-jsonl",
    filePath: "fixture.jsonl",
    sessionId: "search-index-session",
    lineCount: 2,
    sessions: [],
    turns: [],
    messages: [],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
  const session = {
    provider: "codex",
    sourceLabel: "Codex",
    inputKind: "codex-jsonl",
    filePath: file.filePath,
    sessionId: file.sessionId,
    cwd: "/tmp/search-index-app",
    timestamp: "2026-01-01T00:00:00.000Z"
  };
  const message = {
    provider: "codex",
    sourceLabel: "Codex",
    inputKind: "codex-jsonl",
    filePath: file.filePath,
    sessionId: file.sessionId,
    lineNumber: 2,
    timestamp: "2026-01-01T00:00:01.000Z",
    role: "user",
    sourceEvent: "event_msg.user_message",
    content: "Upgrade stale index",
    imagesCount: 0,
    localImagesCount: 0
  };

  return {
    files: [{ ...file, sessions: [session], messages: [message] }],
    sessions: [session],
    turns: [],
    messages: [message],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
}
