import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCodexLogFile } from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

describe("parseCodexLogFile", () => {
  it("normalizes known Codex rollout events and preserves warnings", async () => {
    const parsed = await parseCodexLogFile(fixturePath);

    expect(parsed.sessionId).toBe("sample-session-1");
    expect(parsed.sessions).toHaveLength(1);
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]?.model).toBe("gpt-5.5");
    expect(parsed.messages.filter((message) => message.sourceEvent === "event_msg.user_message")).toHaveLength(1);
    expect(parsed.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
    expect(parsed.tokenUsage).toHaveLength(1);
    expect(parsed.tokenUsage[0]?.usage.freshInputTokens).toBe(10280);
    expect(parsed.taskTimings[0]?.durationMs).toBe(13000);
    expect(parsed.unknownEvents).toHaveLength(1);
    expect(parsed.warnings).toHaveLength(1);
  });
});

