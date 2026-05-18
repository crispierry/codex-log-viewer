import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appPath = resolve(process.argv[2] ?? "dist/macos/Codex Log Viewer.app");
const executablePath = `${appPath}/Contents/MacOS/CodexLogViewerMac`;
const fixturePath = resolve(repoRoot, "fixtures/codex/sample-session.jsonl");

if (process.platform !== "darwin") {
  throw new Error("Packaged macOS app smoke test only runs on macOS.");
}

if (!existsSync(executablePath)) {
  throw new Error(`Missing packaged app executable at ${executablePath}`);
}

if (!existsSync(fixturePath)) {
  throw new Error(`Missing smoke fixture at ${fixturePath}`);
}

await runSmoke("first launch");
assertNoLeakedEngine();
await runSmoke("second launch");
assertNoLeakedEngine();

console.log("Packaged app smoke test passed.");

async function runSmoke(label) {
  const child = spawn(executablePath, [], {
    env: {
      ...process.env,
      CODEX_LOG_VIEWER_SMOKE: "1",
      CODEX_LOG_VIEWER_SMOKE_FIXTURE: fixturePath
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

  const timeout = setTimeout(() => {
    child.kill();
  }, 30_000);

  const exitCode = await new Promise((resolvePromise) => {
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(`Packaged app smoke test failed during ${label} with exit code ${exitCode}\n${stderr}${stdout}`);
  }
}

function assertNoLeakedEngine() {
  const processList = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  const bundledEnginePath = `${appPath}/Contents/Resources/engine/apps/server/dist/index.js`;
  const leaks = processList
    .split("\n")
    .filter((line) => line.includes(bundledEnginePath) || line.includes(executablePath))
    .filter((line) => !line.includes("ps -axo"));

  if (leaks.length > 0) {
    throw new Error(`Packaged app left local engine processes running:\n${leaks.join("\n")}`);
  }
}
