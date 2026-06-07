import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { discoverLogFiles, parseCodexLogFile, parseLogCorpus, parseLogFile } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const eventShapesFixturePath = resolve(testDir, "../../../fixtures/codex/event-shapes.jsonl");
const visualCommentWrapperFixturePath = resolve(testDir, "../../../fixtures/codex/visual-comment-wrapper.jsonl");
const visualCommentImageEvidenceFixturePath = resolve(testDir, "../../../fixtures/codex/visual-comment-image-evidence.jsonl");
const interactionDetailFixturePath = resolve(testDir, "../../../fixtures/codex/interaction-detail.jsonl");
const claudeFixturePath = resolve(testDir, "../../../fixtures/claude/basic-session.jsonl");
const cursorMarkdownFixturePath = resolve(testDir, "../../../fixtures/cursor/basic-export.md");

test("parseCodexLogFile normalizes known Codex rollout events and preserves warnings", async () => {
  const parsed = await parseCodexLogFile(fixturePath);

  assert.equal(parsed.sessionId, "sample-session-1");
  assert.equal(parsed.provider, "codex");
  assert.equal(parsed.sessions[0]?.provider, "codex");
  assert.equal(parsed.sessions.length, 1);
  assert.equal(parsed.turns.length, 1);
  assert.equal(parsed.turns[0]?.model, "gpt-5.5");
  assert.equal(parsed.messages.filter((message) => message.sourceEvent === "event_msg.user_message").length, 1);
  assert.equal(parsed.messages.filter((message) => message.role === "assistant").length, 1);
  assert.equal(parsed.tokenUsage.length, 1);
  assert.equal(parsed.tokenUsage[0]?.usage.freshInputTokens, 10280);
  assert.equal(parsed.taskTimings[0]?.durationMs, 13000);
  assert.equal(parsed.unknownEvents.length, 1);
  assert.equal(parsed.warnings.length, 1);
});

test("parseLogFile normalizes Claude Code JSONL records", async () => {
  const [parsed] = await parseLogFile(claudeFixturePath, "claude");

  assert.equal(parsed?.provider, "claude");
  assert.equal(parsed?.sessionId, "claude-session-1");
  assert.equal(parsed?.sessions[0]?.cwd, "/Users/example/projects/claude-app");
  assert.equal(parsed?.messages.find((message) => message.role === "user")?.content, "Add Claude fixture support");
  assert.equal(parsed?.messages.find((message) => message.role === "assistant")?.content, "I will add the adapter.");
  assert.equal(parsed?.toolEvents.find((event) => event.eventType === "tool_use")?.name, "Bash");
  assert.equal(parsed?.toolEvents.find((event) => event.eventType === "tool_result")?.content, "tests passed");
  assert.equal(parsed?.tokenUsage[0]?.usage.inputTokens, 10);
  assert.equal(parsed?.tokenUsage[0]?.usage.cacheCreationInputTokens, 2);
  assert.equal(parsed?.tokenUsage[0]?.usage.cacheReadInputTokens, 3);
  assert.equal(parsed?.tokenUsage[0]?.usage.totalTokens, 20);
  assert.equal(parsed?.unknownEvents[0]?.topLevelType, "attachment");
  assert.equal(parsed?.warnings[0]?.code, "malformed_json");
});

test("parseLogFile normalizes Cursor SQLite state records", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-cursor-vscdb-`);
  try {
    const cursorDbPath = await createCursorVscdbFixture(tempDir);
    const [parsed] = await parseLogFile(cursorDbPath, "cursor");

    assert.equal(parsed?.provider, "cursor");
    assert.equal(parsed?.inputKind, "cursor-vscdb");
    assert.equal(parsed?.sessionId, "cursor-session-1");
    assert.equal(parsed?.title, "Cursor fixture chat");
    assert.equal(parsed?.sessions[0]?.cwd, "/Users/example/projects/cursor-app");
    assert.equal(parsed?.messages.find((message) => message.role === "user")?.sourceEvent, "cursor.user_message");
    assert.equal(parsed?.messages.find((message) => message.role === "user")?.content, "Add Cursor fixture support");
    assert.equal(parsed?.messages.find((message) => message.role === "assistant")?.content, "Cursor adapter added.");
    assert.equal(parsed?.tokenUsage[0]?.usage.inputTokens, 12);
    assert.equal(parsed?.tokenUsage[0]?.usage.outputTokens, 7);
    assert.equal(parsed?.tokenUsage[0]?.usage.totalTokens, 19);
    assert.equal(parsed?.toolEvents[0]?.name, "Run");
    assert.equal(parsed?.toolEvents[0]?.content, "npm test passed");
    assert.equal(parsed?.taskTimings[0]?.durationMs, 42);
    assert.equal(parsed?.unknownEvents[0]?.payloadType, "7");
    assert.equal(parsed?.warnings[0]?.code, "malformed_cursor_record");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseLogFile reports unsupported Cursor SQLite schemas without throwing", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-cursor-broken-vscdb-`);
  try {
    const cursorDbPath = await createBrokenCursorVscdbFixture(tempDir);
    const [parsed] = await parseLogFile(cursorDbPath, "cursor");

    assert.equal(parsed?.provider, "cursor");
    assert.equal(parsed?.inputKind, "cursor-vscdb");
    assert.equal(parsed?.messages.length, 0);
    assert.equal(parsed?.warnings[0]?.code, "cursor_vscdb_parse_failed");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseLogFile normalizes Cursor Markdown export records", async () => {
  const [parsed] = await parseLogFile(cursorMarkdownFixturePath, "cursor");

  assert.equal(parsed?.provider, "cursor");
  assert.equal(parsed?.inputKind, "cursor-markdown");
  assert.equal(parsed?.title, "Cursor Fixture Export");
  assert.equal(parsed?.messages.find((message) => message.role === "user")?.sourceEvent, "cursor.user_message");
  assert.equal(parsed?.messages.find((message) => message.role === "user")?.content, "Add Cursor Markdown import support.");
  assert.equal(parsed?.messages.find((message) => message.role === "assistant")?.content, "Cursor Markdown export parsing is wired into the provider model.");
});

test("parseLogCorpus can parse mixed provider sources", async () => {
  const corpus = await parseLogCorpus({ paths: [fixturePath, claudeFixturePath] });

  assert.deepEqual([...new Set(corpus.files.map((file) => file.provider))].sort(), ["claude", "codex"]);
  assert.equal(corpus.sessions.some((session) => session.provider === "codex"), true);
  assert.equal(corpus.sessions.some((session) => session.provider === "claude"), true);
});

test("parseLogCorpus filters by provider after detecting each source", async () => {
  const corpus = await parseLogCorpus({ paths: [fixturePath, claudeFixturePath], provider: "claude" });
  const forcedWrongProvider = await parseLogFile(fixturePath, "claude");

  assert.deepEqual(corpus.files.map((file) => file.provider), ["claude"]);
  assert.equal(corpus.messages.every((message) => message.provider === "claude"), true);
  assert.equal(corpus.messages.some((message) => message.sourceEvent === "event_msg.user_message"), false);
  assert.deepEqual(forcedWrongProvider, []);
});

test("parseLogCorpus can filter Cursor provider sources", async () => {
  const corpus = await parseLogCorpus({ paths: [fixturePath, cursorMarkdownFixturePath], provider: "cursor" });

  assert.deepEqual(corpus.files.map((file) => file.provider), ["cursor"]);
  assert.equal(corpus.messages.every((message) => message.provider === "cursor"), true);
  assert.equal(corpus.messages.some((message) => message.sourceEvent === "event_msg.user_message"), false);
});

test("parseLogCorpus discovers provider-specific default roots before parsing", async () => {
  const tempHome = await mkdtemp(`${tmpdir()}/codex-log-viewer-home-`);

  try {
    const codexRoot = resolve(tempHome, ".codex/sessions");
    const claudeRoot = resolve(tempHome, ".claude/projects/project-a");
    await mkdir(codexRoot, { recursive: true });
    await mkdir(claudeRoot, { recursive: true });
    await copyFile(fixturePath, resolve(codexRoot, "sample-session.jsonl"));
    await copyFile(claudeFixturePath, resolve(claudeRoot, "basic-session.jsonl"));

    const codexCorpus = await parseLogCorpus({ homeDir: tempHome });
    assert.deepEqual(codexCorpus.files.map((file) => file.provider), ["codex"]);

    const claudeCorpus = await parseLogCorpus({ provider: "claude", homeDir: tempHome });
    assert.deepEqual(claudeCorpus.files.map((file) => file.provider), ["claude"]);

    const allProvidersCorpus = await parseLogCorpus({ provider: "all", homeDir: tempHome });
    assert.deepEqual(allProvidersCorpus.files.map((file) => file.provider).sort(), ["claude", "codex"]);

    const defaultDiscoveredFiles = await discoverLogFiles(undefined, undefined, tempHome);
    assert.deepEqual(defaultDiscoveredFiles.map((file) => file.endsWith("sample-session.jsonl")), [true]);

    const customDiscoveredFiles = await discoverLogFiles([codexRoot, claudeRoot]);
    assert.equal(customDiscoveredFiles.length, 2);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test("parseCodexLogFile normalizes response items and tool events", async () => {
  const parsed = await parseCodexLogFile(eventShapesFixturePath);

  assert.equal(parsed.sessionId, "event-shapes-session");
  assert.equal(parsed.sessions[0]?.cwd, "/Users/example/projects/shape-app");
  assert.equal(parsed.turns[0]?.turnId, "shape-turn-1");
  assert.equal(parsed.turns[0]?.effort, "high");

  assert.equal(parsed.messages.length, 4);

  const userMessages = parsed.messages.filter((message) => message.sourceEvent === "event_msg.user_message");
  const userMessage = userMessages[0];
  const automationMessage = parsed.messages.find((message) => message.sourceEvent === "event_msg.automation_message");
  assert.equal(userMessage?.role, "user");
  assert.equal(userMessage?.imagesCount, 1);
  assert.equal(userMessage?.localImagesCount, 1);
  assert.equal(userMessages[1]?.content, "Use the real request only.");
  assert.equal(userMessages[1]?.content.includes("# In app browser:"), false);
  assert.equal(automationMessage?.role, "automation");
  assert.match(automationMessage?.content ?? "", /^Automation: Daily fixture sync/);

  const assistantMessage = parsed.messages.find((message) => message.sourceEvent === "response_item.message");
  assert.equal(assistantMessage?.role, "assistant");
  assert.match(assistantMessage?.content ?? "", /Assistant response/);
  assert.match(assistantMessage?.content ?? "", /Second response item block/);

  assert.equal(parsed.tokenUsage.length, 1);
  assert.equal(parsed.tokenUsage[0]?.usage.totalTokens, 150);
  assert.equal(parsed.tokenUsage[0]?.usage.freshInputTokens, 80);
  assert.equal(parsed.tokenUsage[0]?.cumulativeUsage?.totalTokens, 150);
  assert.equal(parsed.tokenUsage[0]?.modelContextWindow, 400000);

  assert.equal(parsed.taskTimings.length, 1);
  assert.equal(parsed.taskTimings[0]?.startedAt, 1777399202000);
  assert.equal(parsed.taskTimings[0]?.durationMs, 12000);
  assert.equal(parsed.taskTimings[0]?.timeToFirstTokenMs, 700);

  assert.equal(parsed.toolEvents.length, 8);
  assert.deepEqual(
    parsed.toolEvents.map((event) => event.eventType),
    [
      "function_call",
      "function_call_output",
      "custom_tool_call",
      "custom_tool_call_output",
      "exec_command_end",
      "patch_apply_end",
      "image_generation_call",
      "image_generation_end"
    ]
  );
  assert.equal(parsed.toolEvents.find((event) => event.eventType === "exec_command_end")?.exitCode, 0);
  assert.equal(parsed.toolEvents.find((event) => event.eventType === "exec_command_end")?.durationMs, 42);
  const imageGenerationEvents = parsed.toolEvents.filter((event) => event.eventType.startsWith("image_generation_"));
  assert.deepEqual(
    imageGenerationEvents.map((event) => event.callId),
    ["image-call-1", "image-call-1"]
  );
  assert.equal(imageGenerationEvents.some((event) => event.content?.includes("redacted-base64-image-data")), false);
  assert.equal(parsed.unknownEvents.length, 2);
  assert.deepEqual(
    parsed.unknownEvents.map((event) => [event.topLevelType, event.payloadType]),
    [
      ["event_msg", "future_payload"],
      ["future_top_level", "future_payload"]
    ]
  );
});

test("parseCodexLogFile bounds raw previews for oversized unknown events", async () => {
  const tempDir = await mkdtemp(`${tmpdir()}/codex-log-viewer-large-unknown-`);
  const fixture = join(tempDir, "large-unknown.jsonl");

  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      fixture,
      `${JSON.stringify({
        timestamp: "2026-04-28T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "future_payload",
          value: "x".repeat(10_000)
        }
      })}\n`,
      "utf8"
    );

    const parsed = await parseCodexLogFile(fixture);
    const unknown = parsed.unknownEvents[0];

    assert.equal(parsed.unknownEvents.length, 1);
    assert.equal(unknown?.rawTruncated, true);
    assert.deepEqual(unknown?.raw.payload.value, {
      truncated: true,
      type: "string",
      length: 10_000
    });
    assert.equal(JSON.stringify(parsed).includes("x".repeat(1_000)), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("parseCodexLogFile extracts visual review comments instead of generated image captions", async () => {
  const parsed = await parseCodexLogFile(visualCommentWrapperFixturePath);
  const userMessage = parsed.messages.find((message) => message.sourceEvent === "event_msg.user_message");

  assert.equal(userMessage?.content, "Move the fixture button to the right side");
  assert.equal(userMessage?.content.includes("The next image shows"), false);
  assert.equal(parsed.messages.filter((message) => message.sourceEvent === "event_msg.user_message").length, 1);
});

test("parseCodexLogFile extracts visual comments when image evidence follows the request marker", async () => {
  const parsed = await parseCodexLogFile(visualCommentImageEvidenceFixturePath);
  const userMessage = parsed.messages.find((message) => message.sourceEvent === "event_msg.user_message");

  assert.equal(userMessage?.content, "I don't know which design school this fixture went to");
  assert.equal(userMessage?.content.includes("untrusted page evidence"), false);
  assert.equal(userMessage?.content.includes("<image>"), false);
});

test("parseCodexLogFile preserves line order for interaction reconstruction", async () => {
  const parsed = await parseCodexLogFile(interactionDetailFixturePath);
  const firstUserMessage = parsed.messages.find((message) => message.content.includes("cache behavior"));
  const assistantMessage = parsed.messages.find((message) => message.role === "assistant" && message.content.includes("unchanged parsed sessions"));
  const developerMessage = parsed.messages.find((message) => message.role === "developer");
  const toolEvent = parsed.toolEvents.find((event) => event.eventType === "custom_tool_call");
  const toolOutput = parsed.toolEvents.find((event) => event.eventType === "custom_tool_call_output");
  const tokenUsage = parsed.tokenUsage[0];

  assert.equal(firstUserMessage?.lineNumber, 4);
  assert.equal(developerMessage?.lineNumber, 5);
  assert.equal(toolEvent?.lineNumber, 6);
  assert.equal(toolOutput?.lineNumber, 7);
  assert.equal(toolOutput?.content, "cache status: warm");
  assert.equal(assistantMessage?.lineNumber, 9);
  assert.equal(tokenUsage?.lineNumber, 10);
  assert.equal(firstUserMessage?.turnId, "interaction-turn-1");
  assert.equal(assistantMessage?.turnId, "interaction-turn-1");
  assert.equal(toolEvent?.turnId, "interaction-turn-1");
});

async function createCursorVscdbFixture(tempDir) {
  const userDir = resolve(tempDir, "User");
  const globalStorageDir = resolve(userDir, "globalStorage");
  const workspaceId = "cursor-workspace";
  const workspaceDir = resolve(userDir, "workspaceStorage", workspaceId);
  await mkdir(globalStorageDir, { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(
    resolve(workspaceDir, "workspace.json"),
    JSON.stringify({ folder: "file:///Users/example/projects/cursor-app" }),
    "utf8"
  );

  const dbPath = resolve(globalStorageDir, "state.vscdb");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
    CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
  `);
  db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run(
    "composer.composerHeaders",
    JSON.stringify({
      allComposers: [
        {
          composerId: "cursor-session-1",
          name: "Cursor fixture chat",
          createdAt: "2026-05-02T09:00:00.000Z",
          lastUpdatedAt: "2026-05-02T09:01:00.000Z",
          workspaceIdentifier: { id: workspaceId }
        }
      ]
    })
  );
  const insertBubble = db.prepare("INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)");
  insertBubble.run("bubbleId:cursor-session-1:cursor-user-1", JSON.stringify({
    bubbleId: "cursor-user-1",
    type: 1,
    text: "Add Cursor fixture support",
    createdAt: "2026-05-02T09:00:00.000Z",
    tokenCount: { inputTokens: 0, outputTokens: 0 }
  }));
  insertBubble.run("bubbleId:cursor-session-1:cursor-assistant-1", JSON.stringify({
    bubbleId: "cursor-assistant-1",
    type: 2,
    text: "Cursor adapter added.",
    createdAt: "2026-05-02T09:00:02.000Z",
    tokenCount: { inputTokens: 12, outputTokens: 7 },
    turnDurationMs: 42,
    toolResults: [{ type: "terminal", name: "Run", output: "npm test passed" }]
  }));
  insertBubble.run("bubbleId:cursor-session-1:cursor-unknown-1", JSON.stringify({
    bubbleId: "cursor-unknown-1",
    type: 7,
    text: "Unknown Cursor bubble shape",
    createdAt: "2026-05-02T09:00:03.000Z"
  }));
  insertBubble.run("bubbleId:cursor-session-1:cursor-bad-1", "{malformed");
  db.close();
  return dbPath;
}

async function createBrokenCursorVscdbFixture(tempDir) {
  const globalStorageDir = resolve(tempDir, "User", "globalStorage");
  await mkdir(globalStorageDir, { recursive: true });
  const dbPath = resolve(globalStorageDir, "state.vscdb");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE);");
  db.close();
  return dbPath;
}
