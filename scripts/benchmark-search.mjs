import { performance } from "node:perf_hooks";
import { searchMessages } from "../packages/analytics/dist/index.js";

const sessions = Number(process.env.CODEX_LOG_VIEWER_BENCH_SESSIONS ?? 300);
const messagesPerSession = Number(process.env.CODEX_LOG_VIEWER_BENCH_MESSAGES_PER_SESSION ?? 60);
const budgetMs = Number(process.env.CODEX_LOG_VIEWER_BENCH_SEARCH_BUDGET_MS ?? 1500);
const corpus = syntheticCorpus(sessions, messagesPerSession);
const startedAt = performance.now();
const result = searchMessages(corpus, { query: "needle phrase", limit: 500 });
const elapsedMs = performance.now() - startedAt;
const messageCount = sessions * messagesPerSession;

console.log(
  JSON.stringify(
    {
      sessions,
      messages: messageCount,
      matches: result.totalMatches,
      elapsedMs: Math.round(elapsedMs),
      budgetMs
    },
    null,
    2
  )
);

if (result.totalMatches === 0) {
  throw new Error("Synthetic search benchmark produced no matches.");
}

if (elapsedMs > budgetMs) {
  throw new Error(`Search benchmark exceeded ${budgetMs}ms budget with ${messageCount} messages.`);
}

function syntheticCorpus(sessionCount, messagesPerSessionCount) {
  const files = [];
  const sessions = [];
  const turns = [];
  const messages = [];

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const sessionId = `synthetic-session-${sessionIndex}`;
    const filePath = `synthetic-${sessionIndex}.jsonl`;
    const cwd = `/Users/example/projects/synthetic-${sessionIndex % 12}`;
    const turnId = `turn-${sessionIndex}`;
    const timestamp = new Date(Date.UTC(2026, 0, 1, 12, sessionIndex % 60, 0)).toISOString();

    files.push({
      filePath,
      sessionId,
      lineCount: messagesPerSessionCount,
      sessions: [],
      turns: [],
      messages: [],
      tokenUsage: [],
      taskTimings: [],
      toolEvents: [],
      unknownEvents: [],
      warnings: []
    });
    sessions.push({ filePath, sessionId, cwd, timestamp });
    turns.push({
      filePath,
      sessionId,
      turnId,
      timestamp,
      cwd,
      model: sessionIndex % 2 === 0 ? "gpt-5.5" : "gpt-5.4"
    });

    for (let messageIndex = 0; messageIndex < messagesPerSessionCount; messageIndex += 1) {
      const hasNeedle = messageIndex % 17 === 0;
      messages.push({
        filePath,
        sessionId,
        turnId,
        timestamp,
        role: messageIndex % 3 === 0 ? "assistant" : "user",
        sourceEvent: messageIndex % 3 === 0 ? "response_item.message" : "event_msg.user_message",
        content: hasNeedle
          ? `Synthetic message ${messageIndex} with needle phrase in session ${sessionIndex}.`
          : `Synthetic message ${messageIndex} in session ${sessionIndex}.`,
        imagesCount: 0,
        localImagesCount: 0
      });
    }
  }

  return {
    files,
    sessions,
    turns,
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
}
