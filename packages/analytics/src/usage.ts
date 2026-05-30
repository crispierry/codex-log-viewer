import type { TokenUsage } from "@codex-log-viewer/parser";

export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    freshInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0
  };
}

export function addUsage(target: TokenUsage, next: TokenUsage): TokenUsage {
  target.inputTokens += next.inputTokens ?? 0;
  target.cachedInputTokens += next.cachedInputTokens ?? 0;
  target.cacheCreationInputTokens += next.cacheCreationInputTokens ?? 0;
  target.cacheReadInputTokens += next.cacheReadInputTokens ?? 0;
  target.freshInputTokens += next.freshInputTokens ?? 0;
  target.outputTokens += next.outputTokens ?? 0;
  target.reasoningOutputTokens += next.reasoningOutputTokens ?? 0;
  target.totalTokens += next.totalTokens ?? 0;
  return target;
}

export function usageFromTotal(totalTokens = 0): TokenUsage {
  const usage = emptyUsage();
  usage.totalTokens = totalTokens;
  return usage;
}
