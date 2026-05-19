import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const appPath = resolve(process.argv[2] ?? "dist/macos/Codex Log Viewer.app");
const executablePath = `${appPath}/Contents/MacOS/CodexLogViewerMac`;
const fixturePath = resolve(repoRoot, "fixtures/codex/sample-session.jsonl");

if (process.platform !== "darwin") {
  throw new Error("Native macOS UI smoke test only runs on macOS.");
}

if (!existsSync(executablePath)) {
  throw new Error(`Missing packaged app executable at ${executablePath}`);
}

const child = spawn(executablePath, [], {
  env: {
    ...process.env,
    CODEX_LOG_VIEWER_UI_TEST: "1",
    CODEX_LOG_VIEWER_UI_TEST_AUTO_QUIT: "1",
    CODEX_LOG_VIEWER_UI_WORKFLOW_SMOKE: "1",
    CODEX_LOG_VIEWER_EPHEMERAL_SETTINGS: "1",
    CODEX_LOG_VIEWER_INITIAL_PATHS: fixturePath
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

try {
  await waitForWindowText([
    "All Projects",
    "source-picker-button",
    "message-search-field",
    "session-search-field",
    "export-json-button",
    "export-csv-button"
  ]);
} finally {
  await waitForExit(child);
  assertNoLeakedEngine();
}

if (child.exitCode !== 0 && child.exitCode !== null) {
  throw new Error(`Native UI smoke app exited with ${child.exitCode}\n${stderr}${stdout}`);
}

if (!stdout.includes("Native UI workflow smoke passed.")) {
  throw new Error(`Native UI workflow did not report success.\n${stderr}${stdout}`);
}

console.log("Native macOS UI smoke test passed.");

async function waitForWindowText(expectedText) {
  const deadline = Date.now() + 45_000;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = readWindowText();
    if (expectedText.every((text) => lastText.includes(text))) {
      return lastText;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  }

  throw new Error(`Timed out waiting for native UI text: ${expectedText.join(", ")}\n${lastText}`);
}

function readWindowText() {
  const result = spawnSync("osascript", ["-e", uiTextAppleScript()], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    return `${result.stderr}\n${result.stdout}`;
  }
  return result.stdout;
}

function waitForExit(process) {
  return new Promise((resolvePromise) => {
    if (process.exitCode !== null || process.signalCode !== null) {
      resolvePromise();
      return;
    }
    const timeout = setTimeout(() => {
      requestAppQuit();
      process.kill("SIGKILL");
      resolvePromise();
    }, 20_000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

function requestAppQuit() {
  spawnSync("osascript", ["-e", quitAppleScript()], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
}

function assertNoLeakedEngine() {
  const processList = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).stdout;
  const bundledEnginePath = `${appPath}/Contents/Resources/engine/apps/server/dist/index.js`;
  const leaks = processList
    .split("\n")
    .filter((line) => line.includes(bundledEnginePath) || line.includes(executablePath))
    .filter((line) => !line.includes("ps -axo"));

  if (leaks.length > 0) {
    throw new Error(`Native UI smoke left app or engine processes running:\n${leaks.join("\n")}`);
  }
}

function uiTextAppleScript() {
  return `
on collectIdentifiers(elementRef)
  set collectedIdentifiers to ""
  tell application "System Events"
    try
      set identifierValue to value of attribute "AXIdentifier" of elementRef
      if identifierValue is not missing value then
        set collectedIdentifiers to collectedIdentifiers & (identifierValue as text) & linefeed
      end if
    end try
    try
      set childRefs to UI elements of elementRef
    on error
      set childRefs to {}
    end try
  end tell
  repeat with childRef in childRefs
    set collectedIdentifiers to collectedIdentifiers & my collectIdentifiers(childRef)
  end repeat
  return collectedIdentifiers
end collectIdentifiers

tell application "System Events"
  set processName to ""
  repeat with candidateName in {"Codex Log Viewer", "CodexLogViewerMac"}
    if exists process (candidateName as text) then
      set processName to candidateName as text
      exit repeat
    end if
  end repeat

  if processName = "" then return "__NO_PROCESS__"

  tell process processName
    if not (exists window 1) then return "__NO_WINDOW__"
    set collectedText to ""
    try
      set collectedText to collectedText & ((name of window 1) as text) & linefeed
    end try
    try
      set collectedText to collectedText & ((name of every UI element of entire contents of window 1) as text) & linefeed
    end try
    try
      set collectedText to collectedText & ((value of every UI element of entire contents of window 1) as text) & linefeed
    end try
    try
      set collectedText to collectedText & my collectIdentifiers(window 1)
    end try
    return collectedText
  end tell
end tell
`;
}

function quitAppleScript() {
  return `
tell application "System Events"
  repeat with candidateName in {"Codex Log Viewer", "CodexLogViewerMac"}
    if exists process (candidateName as text) then
      tell process (candidateName as text)
        try
          click menu item "Quit Codex Log Viewer" of menu "Codex Log Viewer" of menu bar item "Codex Log Viewer" of menu bar 1
        end try
      end tell
    end if
  end repeat
end tell
`;
}
