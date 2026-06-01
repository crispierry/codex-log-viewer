import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { discoverCodexLogFiles } from "../dist/index.js";

test("discoverCodexLogFiles finds nested jsonl logs without including ignored directories", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-discover-`);
  const sessionsDir = join(tempDir, "sessions");
  const firstSession = join(sessionsDir, "2026", "05", "31", "rollout-first.jsonl");
  const secondSession = join(sessionsDir, "2026", "05", "30", "rollout-second.jsonl");
  const ignoredGitSession = join(sessionsDir, ".git", "rollout-ignored.jsonl");
  const ignoredNodeSession = join(sessionsDir, "node_modules", "rollout-ignored.jsonl");

  try {
    await writeFixture(firstSession);
    await writeFixture(secondSession);
    await writeFixture(ignoredGitSession);
    await writeFixture(ignoredNodeSession);
    await writeFile(join(sessionsDir, "notes.txt"), "not a log\n", "utf8");

    for (let index = 0; index < 160; index += 1) {
      await writeFixture(join(sessionsDir, "wide", String(index), `rollout-${index}.jsonl`));
    }

    const files = await discoverCodexLogFiles([sessionsDir]);

    assert.equal(files.includes(firstSession), true);
    assert.equal(files.includes(secondSession), true);
    assert.equal(files.some((file) => file.includes(".git")), false);
    assert.equal(files.some((file) => file.includes("node_modules")), false);
    assert.equal(files.length, 162);
    assert.deepEqual(files, [...files].sort());
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function writeFixture(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, "{}\n", "utf8");
}
