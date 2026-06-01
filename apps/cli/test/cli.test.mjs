import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const testDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(testDir, "../dist/index.js");
const codexFixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const claudeFixturePath = resolve(testDir, "../../../fixtures/claude/basic-session.jsonl");

test("CLI provider=all scans all default provider roots instead of Codex only", async () => {
  const tempHome = await mkdtemp(`${tmpdir()}/codex-log-viewer-cli-home-`);
  try {
    const codexRoot = resolve(tempHome, ".codex/sessions");
    const claudeRoot = resolve(tempHome, ".claude/projects/project-a");
    await mkdir(codexRoot, { recursive: true });
    await mkdir(claudeRoot, { recursive: true });
    await copyFile(codexFixturePath, resolve(codexRoot, "sample-session.jsonl"));
    await copyFile(claudeFixturePath, resolve(claudeRoot, "basic-session.jsonl"));

    const defaultSummary = await runCli(["summary", "--json"], tempHome);
    assert.deepEqual(defaultSummary.summary.providers.map((provider) => provider.provider), ["codex"]);

    const allSummary = await runCli(["summary", "--provider", "all", "--json"], tempHome);
    assert.deepEqual(allSummary.summary.providers.map((provider) => provider.provider).sort(), ["claude", "codex"]);
    assert.equal(allSummary.summary.totals.userMessages, 2);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

async function runCli(args, home) {
  const { stdout } = await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      HOME: home
    }
  });
  return JSON.parse(stdout);
}
