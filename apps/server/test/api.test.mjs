import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startServer } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

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

    const sentMessages = await fetch(`${server.url}/api/messages/search?role=user&project=sample-app`, { headers });
    assert.equal(sentMessages.status, 200);
    const sentMessagesBody = await sentMessages.json();
    assert.equal(sentMessagesBody.search.totalMatches, 1);
    assert.equal(sentMessagesBody.search.results[0]?.role, "user");
    assert.match(sentMessagesBody.search.results[0]?.snippet, /parser test/);
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
