import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexLogFile } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");
const eventShapesFixturePath = resolve(testDir, "../../../fixtures/codex/event-shapes.jsonl");
const visualCommentWrapperFixturePath = resolve(testDir, "../../../fixtures/codex/visual-comment-wrapper.jsonl");
const interactionDetailFixturePath = resolve(testDir, "../../../fixtures/codex/interaction-detail.jsonl");

test("parseCodexLogFile normalizes known Codex rollout events and preserves warnings", async () => {
  const parsed = await parseCodexLogFile(fixturePath);

  assert.equal(parsed.sessionId, "sample-session-1");
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

  assert.equal(parsed.toolEvents.length, 6);
  assert.deepEqual(
    parsed.toolEvents.map((event) => event.eventType),
    [
      "function_call",
      "function_call_output",
      "custom_tool_call",
      "custom_tool_call_output",
      "exec_command_end",
      "patch_apply_end"
    ]
  );
  assert.equal(parsed.toolEvents.find((event) => event.eventType === "exec_command_end")?.exitCode, 0);
  assert.equal(parsed.toolEvents.find((event) => event.eventType === "exec_command_end")?.durationMs, 42);
  assert.equal(parsed.unknownEvents.length, 2);
  assert.deepEqual(
    parsed.unknownEvents.map((event) => [event.topLevelType, event.payloadType]),
    [
      ["event_msg", "future_payload"],
      ["future_top_level", "future_payload"]
    ]
  );
});

test("parseCodexLogFile extracts visual review comments instead of generated image captions", async () => {
  const parsed = await parseCodexLogFile(visualCommentWrapperFixturePath);
  const userMessage = parsed.messages.find((message) => message.sourceEvent === "event_msg.user_message");

  assert.equal(userMessage?.content, "Move the fixture button to the right side");
  assert.equal(userMessage?.content.includes("The next image shows"), false);
  assert.equal(parsed.messages.filter((message) => message.sourceEvent === "event_msg.user_message").length, 1);
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
