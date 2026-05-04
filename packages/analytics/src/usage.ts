import type { TokenUsage } from "@codex-log-viewer/parser";

export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    freshInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0
  };
}

export function addUsage(target: TokenUsage, next: TokenUsage): TokenUsage {
  target.inputTokens += next.inputTokens;
  target.cachedInputTokens += next.cachedInputTokens;
  target.freshInputTokens += next.freshInputTokens;
  target.outputTokens += next.outputTokens;
  target.reasoningOutputTokens += next.reasoningOutputTokens;
  target.totalTokens += next.totalTokens;
  return target;
}

export function usageFromTotal(totalTokens = 0): TokenUsage {
  const usage = emptyUsage();
  usage.totalTokens = totalTokens;
  return usage;
}

