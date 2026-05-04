import type { ProjectSummary } from "./types.js";

export function summaryToCsv(summary: ProjectSummary): string {
  const rows = [
    ["metric", "value"],
    ["project", summary.project],
    ["sessions", summary.totals.sessions],
    ["turns", summary.totals.turns],
    ["user_messages", summary.totals.userMessages],
    ["assistant_messages", summary.totals.assistantMessages],
    ["unique_user_messages", summary.totals.uniqueUserMessages],
    ["input_tokens", summary.tokens.inputTokens],
    ["cached_input_tokens", summary.tokens.cachedInputTokens],
    ["fresh_input_tokens", summary.tokens.freshInputTokens],
    ["output_tokens", summary.tokens.outputTokens],
    ["reasoning_output_tokens", summary.tokens.reasoningOutputTokens],
    ["total_tokens", summary.tokens.totalTokens],
    ["unknown_events", summary.totals.unknownEvents],
    ["parse_warnings", summary.totals.parseWarnings]
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string | number): string {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }
  return stringValue;
}

