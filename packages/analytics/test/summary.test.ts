import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCodexCorpus } from "@codex-log-viewer/parser";
import { summarizeParsedCorpus } from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

describe("summarizeParsedCorpus", () => {
  it("aggregates messages, unique messages, tokens, models, and warnings", async () => {
    const corpus = await parseCodexCorpus({ paths: [fixturePath] });
    const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });

    expect(summary.totals.sessions).toBe(1);
    expect(summary.totals.userMessages).toBe(1);
    expect(summary.totals.uniqueUserMessages).toBe(1);
    expect(summary.tokens.totalTokens).toBe(17277);
    expect(summary.tokens.freshInputTokens).toBe(10280);
    expect(summary.models[0]?.model).toBe("gpt-5.5");
    expect(summary.totals.unknownEvents).toBe(1);
    expect(summary.totals.parseWarnings).toBe(1);
    expect(summary.messagesByDay[0]?.count).toBe(1);
  });
});

