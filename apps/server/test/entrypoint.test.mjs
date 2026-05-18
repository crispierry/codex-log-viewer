import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");

test("server entrypoint starts when launched through a path containing spaces", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "codex log viewer "));
  const linkedRepo = join(tempDir, "repo with spaces");
  const urlFile = join(tempDir, "server url.txt");
  let child;

  try {
    await symlink(repoRoot, linkedRepo, "dir");
    child = spawn(
      process.execPath,
      [join(linkedRepo, "apps/server/dist/index.js"), "--port=0", `--url-file=${urlFile}`],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const output = collectProcessOutput(child);
    const url = await waitForFile(urlFile, child, output);

    assert.match(url.trim(), /^http:\/\/127\.0\.0\.1:\d+$/);
  } finally {
    if (child && child.exitCode === null) {
      const exitPromise = waitForExit(child);
      child.kill();
      await exitPromise;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
});

function collectProcessOutput(child) {
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
  });
  return output;
}

async function waitForFile(filePath, child, output) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      if (child.exitCode !== null) {
        throw new Error(`server exited before writing URL\n${output.stderr}${output.stdout}`);
      }
      await sleep(100);
    }
  }

  throw new Error(`server did not write URL\n${output.stderr}${output.stdout}`);
}

function waitForExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolvePromise) => {
    child.once("exit", () => resolvePromise());
  });
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
