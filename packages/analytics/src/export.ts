import type { ProjectSummary } from "./types.js";

export function redactedProjectSummary(summary: ProjectSummary): ProjectSummary {
  return {
    ...summary,
    filters: {
      ...summary.filters,
      paths: summary.filters.paths.map(() => "[redacted]")
    },
    sessions: summary.sessions.map((session) => ({
      ...session,
      filePath: "[redacted]",
      cwd: session.cwd ? "[redacted]" : undefined
    })),
    repeatedUserMessages: summary.repeatedUserMessages.map((message) => ({
      ...message,
      id: "[redacted]",
      sample: "[redacted]",
      variants: message.variants.map((variant) => ({
        ...variant,
        sample: "[redacted]"
      }))
    }))
  };
}

export function summaryToJson(summary: ProjectSummary, options: { redacted?: boolean } = {}): string {
  const exportSummary = options.redacted ? redactedProjectSummary(summary) : summary;
  return `${JSON.stringify(exportSummary, null, 2)}\n`;
}

export function summaryToCsv(summary: ProjectSummary): string {
  const rows = [
    ["metric", "value"],
    ["project", summary.project],
    ["sessions", summary.totals.sessions],
    ["turns", summary.totals.turns],
    ["user_messages", summary.totals.userMessages],
    ["automation_messages", summary.totals.automationMessages],
    ["assistant_messages", summary.totals.assistantMessages],
    ["unique_user_messages", summary.totals.uniqueUserMessages],
    ["repeated_user_messages", summary.repeatedUserMessages.length],
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
