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
      title: session.title ? "[redacted]" : undefined,
      providerConversationId: session.providerConversationId ? "[redacted]" : undefined,
      filePath: "[redacted]",
      cwd: session.cwd ? "[redacted]" : undefined
    })),
    promptIntents: {
      ...summary.promptIntents,
      buckets: summary.promptIntents.buckets.map((bucket) => ({
        ...bucket,
        examples: bucket.examples.map(() => "[redacted]")
      }))
    },
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
    ["providers", summary.providers.map((provider) => provider.provider).join("|")],
    ["prompt_intent_classified_messages", summary.promptIntents.classifiedMessages],
    ["prompt_intent_unclassified_messages", summary.promptIntents.unclassifiedMessages],
    ["input_tokens", summary.tokens.inputTokens],
    ["cached_input_tokens", summary.tokens.cachedInputTokens],
    ["fresh_input_tokens", summary.tokens.freshInputTokens],
    ["output_tokens", summary.tokens.outputTokens],
    ["reasoning_output_tokens", summary.tokens.reasoningOutputTokens],
    ["total_tokens", summary.tokens.totalTokens],
    ["unknown_events", summary.totals.unknownEvents],
    ["parse_warnings", summary.totals.parseWarnings]
  ];

  for (const bucket of summary.promptIntents.buckets) {
    rows.push([`prompt_intent_${bucket.key}`, bucket.count]);
  }

  for (const provider of summary.providers) {
    rows.push([`provider_${provider.provider}_messages`, provider.messages]);
    rows.push([`provider_${provider.provider}_sessions`, provider.sessions]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string | number): string {
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll("\"", "\"\"")}"`;
  }
  return stringValue;
}
