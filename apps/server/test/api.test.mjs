import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
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
  } finally {
    await server.close();
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
