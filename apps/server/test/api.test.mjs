import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const interactionDetailFixturePath = resolve(testDir, "../../../fixtures/codex/interaction-detail.jsonl");

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
  } finally {
    await server.close();
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
    assert.equal(submittedMessagesBody.search.results[0]?.snippet.includes("# In app browser:"), false);
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
