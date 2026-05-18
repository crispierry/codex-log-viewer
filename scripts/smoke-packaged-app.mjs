import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appPath = resolve(process.argv[2] ?? "dist/macos/Codex Log Viewer.app");
const fixturePath = resolve(repoRoot, "fixtures/codex/sample-session.jsonl");

if (process.platform !== "darwin") {
  throw new Error("Packaged macOS app smoke test only runs on macOS.");
}

if (!existsSync(executablePathFor(appPath))) {
  throw new Error(`Missing packaged app executable at ${executablePathFor(appPath)}`);
}

if (!existsSync(fixturePath)) {
  throw new Error(`Missing smoke fixture at ${fixturePath}`);
}

await runSmoke("first launch");
assertNoLeakedEngine(appPath);
await runSmoke("second launch");
assertNoLeakedEngine(appPath);
await runOpenSmoke(appPath, "Finder-style launch");
assertNoLeakedEngine(appPath);
await runRelocatedSmoke();
await runMissingEngineSmoke();

console.log("Packaged app smoke test passed.");

async function runSmoke(label, targetAppPath = appPath, sourceFixturePath = fixturePath) {
  const { exitCode, stdout, stderr } = await runExecutableSmoke(targetAppPath, sourceFixturePath);
  if (exitCode !== 0) {
    throw new Error(`Packaged app smoke test failed during ${label} with exit code ${exitCode}\n${stderr}${stdout}`);
  }
  if (!stdout.includes("Codex Log Viewer packaged smoke workflow passed.")) {
    throw new Error(`Packaged app smoke test did not report success during ${label}\n${stderr}${stdout}`);
  }
}

async function runExecutableSmoke(targetAppPath, sourceFixturePath = fixturePath) {
  const executablePath = executablePathFor(targetAppPath);
  const child = spawn(executablePath, [], {
    cwd: tmpdir(),
    env: {
      ...process.env,
      CODEX_LOG_VIEWER_SMOKE: "1",
      CODEX_LOG_VIEWER_SMOKE_FIXTURE: sourceFixturePath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await waitForExitCode(child, 30_000);
  return { exitCode, stdout, stderr };
}

async function runOpenSmoke(targetAppPath, label, sourceFixturePath = fixturePath) {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-open-smoke-`);
  const stdoutPath = `${tempDir}/stdout.log`;
  const stderrPath = `${tempDir}/stderr.log`;
  let launcherStdout = "";
  let launcherStderr = "";
  const executablePath = executablePathFor(targetAppPath);

  try {
    const child = spawn(
      "open",
      [
        "-n",
        "-W",
        "-o",
        stdoutPath,
        "--stderr",
        stderrPath,
        "--env",
        "CODEX_LOG_VIEWER_SMOKE=1",
        "--env",
        `CODEX_LOG_VIEWER_SMOKE_FIXTURE=${sourceFixturePath}`,
        targetAppPath
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    child.stdout.on("data", (chunk) => {
      launcherStdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      launcherStderr += chunk;
    });
    const exitCode = await waitForExitCode(child, 30_000);
    const stdout = await readFileIfExists(stdoutPath);
    const stderr = await readFileIfExists(stderrPath);
    const diagnostics = [stderr, stdout, launcherStderr, launcherStdout].filter(Boolean).join("");

    if (exitCode !== 0) {
      throw new Error(`Packaged app ${label} failed with exit code ${exitCode}\n${diagnostics}`);
    }
    if (!stdout.includes("Codex Log Viewer packaged smoke workflow passed.")) {
      throw new Error(`Packaged app ${label} did not report success.\n${diagnostics}`);
    }
  } finally {
    terminateLeakedAppProcesses(executablePath);
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runRelocatedSmoke() {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-relocated-smoke-`);
  const relocatedAppPath = join(tempDir, "Codex Log Viewer.app");
  const relocatedFixturePath = join(tempDir, "sample-session.jsonl");

  try {
    execFileSync("ditto", [appPath, relocatedAppPath], { stdio: "ignore" });
    await copyFile(fixturePath, relocatedFixturePath);
    await runSmoke("relocated executable launch", relocatedAppPath, relocatedFixturePath);
    assertNoLeakedEngine(relocatedAppPath);
    await runOpenSmoke(relocatedAppPath, "relocated Finder-style launch", relocatedFixturePath);
    assertNoLeakedEngine(relocatedAppPath);
  } finally {
    terminateLeakedAppProcesses(executablePathFor(relocatedAppPath));
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runMissingEngineSmoke() {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-missing-engine-smoke-`);
  const brokenAppPath = join(tempDir, "Codex Log Viewer.app");
  const brokenFixturePath = join(tempDir, "sample-session.jsonl");

  try {
    execFileSync("ditto", [appPath, brokenAppPath], { stdio: "ignore" });
    await copyFile(fixturePath, brokenFixturePath);
    await rm(join(brokenAppPath, "Contents/Resources/engine/apps/server/dist/index.js"), { force: true });

    const { exitCode, stdout, stderr } = await runExecutableSmoke(brokenAppPath, brokenFixturePath);
    const diagnostics = `${stderr}${stdout}`;
    if (exitCode === 0) {
      throw new Error("Packaged app missing-engine smoke unexpectedly succeeded.");
    }
    if (!diagnostics.includes("The app cannot find the local parser engine")) {
      throw new Error(`Packaged app missing-engine smoke did not report the expected diagnostic.\n${diagnostics}`);
    }
    assertNoLeakedEngine(brokenAppPath);
  } finally {
    terminateLeakedAppProcesses(executablePathFor(brokenAppPath));
    await rm(tempDir, { recursive: true, force: true });
  }
}

function waitForExitCode(child, timeoutMs) {
  return new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolvePromise(1);
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolvePromise(code ?? 1);
    });
  });
}

async function readFileIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function assertNoLeakedEngine(targetAppPath) {
  const processList = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  const executablePath = executablePathFor(targetAppPath);
  const bundledEnginePath = `${targetAppPath}/Contents/Resources/engine/apps/server/dist/index.js`;
  const leaks = processList
    .split("\n")
    .filter((line) => line.includes(bundledEnginePath) || line.includes(executablePath))
    .filter((line) => !line.includes("ps -axo"));

  if (leaks.length > 0) {
    throw new Error(`Packaged app left local engine processes running:\n${leaks.join("\n")}`);
  }
}

function executablePathFor(targetAppPath) {
  return `${targetAppPath}/Contents/MacOS/CodexLogViewerMac`;
}

function terminateLeakedAppProcesses(executablePath) {
  try {
    execFileSync("pkill", ["-f", executablePath], { stdio: "ignore" });
  } catch {
    // No matching process is the expected case after a passing smoke run.
  }
}
