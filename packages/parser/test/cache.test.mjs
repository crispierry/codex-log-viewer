import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseCodexCorpusWithCache, parseLogCorpusWithCache } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const claudeFixturePath = resolve(testDir, "../../../fixtures/claude/basic-session.jsonl");
const cursorMarkdownFixturePath = resolve(testDir, "../../../fixtures/cursor/basic-export.md");

test("parseCodexCorpusWithCache incrementally reuses unchanged parsed session files", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-cache-`);
  const sourceDir = join(tempDir, "logs");
  const cacheDir = join(tempDir, "cache");
  const sessionA = join(sourceDir, "session-a.jsonl");
  const sessionB = join(sourceDir, "session-b.jsonl");

  try {
    await writeSession(sessionA, {
      sessionId: "session-a",
      cwd: "/tmp/cache-app",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: "First cached message"
    });

    const cold = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(cold.cache.cacheStatus, "updated");
    assert.equal(cold.cache.parsedFiles, 1);
    assert.equal(cold.cache.reusedFiles, 0);
    assert.equal(cold.corpus.messages.length, 1);

    const warm = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(warm.cache.cacheStatus, "ready");
    assert.equal(warm.cache.parsedFiles, 0);
    assert.equal(warm.cache.reusedFiles, 1);
    assert.equal(warm.corpus.messages[0]?.content, "First cached message");

    await writeSession(sessionB, {
      sessionId: "session-b",
      cwd: "/tmp/cache-app",
      timestamp: "2026-01-02T00:00:00.000Z",
      message: "Second cached message"
    });

    const added = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(added.cache.cacheStatus, "updated");
    assert.equal(added.cache.reusedFiles, 1);
    assert.equal(added.cache.parsedFiles, 1);
    assert.equal(added.cache.totalFiles, 2);
    assert.deepEqual(
      added.corpus.sessions.map((session) => session.sessionId).sort(),
      ["session-a", "session-b"]
    );

    await writeFile(
      sessionA,
      `${await readFile(sessionA, "utf8")}${JSON.stringify({
        timestamp: "2026-01-01T00:01:00.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Changed cached message"
        }
      })}\n`,
      "utf8"
    );

    const changed = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(changed.cache.cacheStatus, "updated");
    assert.equal(changed.cache.reusedFiles, 1);
    assert.equal(changed.cache.parsedFiles, 1);
    assert.equal(changed.corpus.messages.some((message) => message.content === "Changed cached message"), true);

    await unlink(sessionB);
    const removed = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(removed.cache.cacheStatus, "updated");
    assert.equal(removed.cache.removedFiles, 1);
    assert.equal(removed.cache.totalFiles, 1);
    assert.deepEqual(removed.corpus.sessions.map((session) => session.sessionId), ["session-a"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseCodexCorpusWithCache repairs corrupt files and stale manifests", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-cache-repair-`);
  const sourceDir = join(tempDir, "logs");
  const cacheDir = join(tempDir, "cache");
  const sessionPath = join(sourceDir, "session-a.jsonl");

  try {
    await writeSession(sessionPath, {
      sessionId: "session-a",
      cwd: "/tmp/cache-app",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: "Repair cached message"
    });

    const cold = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(cold.cache.parsedFiles, 1);

    const manifestPath = resolve(cacheDir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const entry = Object.values(manifest.entries)[0];
    await writeFile(resolve(cacheDir, "files", entry.cacheFile), "{not-json}\n", "utf8");

    const repaired = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(repaired.cache.cacheStatus, "updated");
    assert.equal(repaired.cache.parsedFiles, 1);
    assert.equal(repaired.corpus.messages[0]?.content, "Repair cached message");

    const staleManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    staleManifest.parserVersion = "older-parser";
    await writeFile(manifestPath, `${JSON.stringify(staleManifest, null, 2)}\n`, "utf8");

    const invalidated = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir });
    assert.equal(invalidated.cache.cacheStatus, "updated");
    assert.equal(invalidated.cache.parsedFiles, 1);
    assert.equal(invalidated.cache.reusedFiles, 0);

    const rebuilt = await parseCodexCorpusWithCache({ paths: [sourceDir], cacheDir, rebuildCache: true });
    assert.equal(rebuilt.cache.cacheStatus, "rebuilt");
    assert.equal(rebuilt.cache.parsedFiles, 1);
    assert.equal(rebuilt.cache.reusedFiles, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseLogCorpusWithCache filters provider after reusing detected parsed files", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-provider-cache-`);
  const cacheDir = join(tempDir, "cache");
  const paths = [fixturePath, claudeFixturePath, cursorMarkdownFixturePath];

  try {
    const allProviders = await parseLogCorpusWithCache({ paths, cacheDir });
    assert.deepEqual(allProviders.corpus.files.map((file) => file.provider).sort(), ["claude", "codex", "cursor"]);

    const claudeOnly = await parseLogCorpusWithCache({ paths, provider: "claude", cacheDir });
    assert.equal(claudeOnly.cache.reusedFiles, 3);
    assert.deepEqual(claudeOnly.corpus.files.map((file) => file.provider), ["claude"]);
    assert.equal(claudeOnly.corpus.messages.every((message) => message.provider === "claude"), true);

    const codexOnly = await parseLogCorpusWithCache({ paths, provider: "codex", cacheDir });
    assert.equal(codexOnly.cache.reusedFiles, 3);
    assert.deepEqual(codexOnly.corpus.files.map((file) => file.provider), ["codex"]);
    assert.equal(codexOnly.corpus.messages.every((message) => message.provider === "codex"), true);

    const cursorOnly = await parseLogCorpusWithCache({ paths, provider: "cursor", cacheDir });
    assert.equal(cursorOnly.cache.reusedFiles, 3);
    assert.deepEqual(cursorOnly.corpus.files.map((file) => file.provider), ["cursor"]);
    assert.equal(cursorOnly.corpus.messages.every((message) => message.provider === "cursor"), true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeSession(filePath, { sessionId, cwd, timestamp, message }) {
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
