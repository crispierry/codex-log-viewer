import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexLogFile } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

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
