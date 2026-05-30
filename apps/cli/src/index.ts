#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  generateAuditMarkdown,
  loadCorpus,
  mergeAuditMarkdown,
  summaryToCsv,
  summaryToJson,
  summarizeParsedCorpus,
  summarizeProject,
  type ProjectSummary,
  type SummaryOptions
} from "@codex-log-viewer/analytics";

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean | string[]>;
}

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  switch (parsed.command) {
    case "projects":
      await projectsCommand(parsed);
      break;
    case "sessions":
      await sessionsCommand(parsed);
      break;
    case "summary":
      await summaryCommand(parsed);
      break;
    case "export":
      await exportCommand(parsed);
      break;
    case "audit":
      await auditCommand(parsed);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      printHelp();
      process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const options: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const next = rest[index + 1];
    const value = inlineValue ?? (next !== undefined && !next.startsWith("--") ? next : true);
    if (inlineValue === undefined && value === next) {
      index += 1;
    }

    if (rawKey === "path") {
      const current = options.path;
      options.path = [...(Array.isArray(current) ? current : current ? [String(current)] : []), String(value)];
    } else {
      options[rawKey] = value;
    }
  }

  return { command, options };
}

async function projectsCommand(parsed: ParsedArgs): Promise<void> {
  const loaded = await loadCorpus(summaryOptions(parsed));
  if (jsonOutput(parsed)) {
    printJson({ projects: loaded.projects });
    return;
  }

  printTable(
    ["Project", "Providers", "Sessions", "Turns", "Messages", "Tokens"],
    loaded.projects.map((project) => [
      project.project,
      project.providers.join(", "),
      project.sessions,
      project.turns,
      project.messages,
      formatNumber(project.totalTokens)
    ])
  );
}

async function sessionsCommand(parsed: ParsedArgs): Promise<void> {
  const loaded = await loadCorpus(summaryOptions(parsed));
  const summary = summarizeParsedCorpus(loaded.corpus, summaryOptions(parsed));
  if (jsonOutput(parsed)) {
    printJson({ sessions: summary.sessions });
    return;
  }

  printTable(
    ["Session", "Provider", "Project", "User Msgs", "Automations", "Tokens", "Last Seen"],
    summary.sessions.map((session) => [
      session.sessionId,
      session.provider,
      session.project,
      session.userMessages,
      session.automationMessages,
      formatNumber(session.totalTokens),
      session.lastSeen ?? ""
    ])
  );
}

async function summaryCommand(parsed: ParsedArgs): Promise<void> {
  const summary = await summarizeProject(summaryOptions(parsed));
  if (jsonOutput(parsed)) {
    printJson({ summary });
    return;
  }
  printSummary(summary);
}

async function exportCommand(parsed: ParsedArgs): Promise<void> {
  const summary = await summarizeProject(summaryOptions(parsed));
  const format = String(parsed.options.format ?? "json");
  const output = typeof parsed.options.output === "string" ? parsed.options.output : undefined;
  const body = format === "csv" ? summaryToCsv(summary) : summaryToJson(summary, { redacted: parsed.options.raw !== true });

  if (output) {
    await writeFile(output, body, "utf8");
    process.stdout.write(`Wrote ${output}\n`);
  } else {
    process.stdout.write(body);
  }
}

async function auditCommand(parsed: ParsedArgs): Promise<void> {
  const repoPath = stringOption(parsed.options.repo);
  const summaryOptionsValue = {
    ...summaryOptions(parsed),
    project: stringOption(parsed.options.project)
  };
  const loaded = await loadCorpus(summaryOptionsValue);
  const body = generateAuditMarkdown(loaded.corpus, {
    ...summaryOptionsValue,
    repoPath: repoPath ? resolve(repoPath) : undefined,
    includeResponses: parsed.options["no-responses"] !== true,
    privacy: parsed.options.raw === true ? "raw" : "public"
  });
  const output = stringOption(parsed.options.output);

  if (output) {
    const existing = await readOptionalFile(output);
    const merge = mergeAuditMarkdown(existing, body);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, merge.markdown, "utf8");
    process.stdout.write(`Wrote ${output} (${merge.appendedSections} new, ${merge.skippedSections} already present)\n`);
  } else {
    process.stdout.write(body);
  }
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function summaryOptions(parsed: ParsedArgs): SummaryOptions {
  const paths = arrayOption(parsed.options.path);
  return {
    paths: paths.length > 0 ? paths : undefined,
    project: stringOption(parsed.options.project),
    since: stringOption(parsed.options.since),
    until: stringOption(parsed.options.until),
    provider: providerOption(parsed.options.provider)
  };
}

function printSummary(summary: ProjectSummary): void {
  process.stdout.write(`Codex Log Viewer Summary\n`);
  process.stdout.write(`Project: ${summary.project}\n`);
  process.stdout.write(`Generated: ${summary.generatedAt}\n\n`);

  printTable(
    ["Metric", "Value"],
    [
      ["Sessions", summary.totals.sessions],
      ["Turns", summary.totals.turns],
      ["User messages", summary.totals.userMessages],
      ["Automation messages", summary.totals.automationMessages],
      ["Assistant messages", summary.totals.assistantMessages],
      ["Unique user messages", summary.totals.uniqueUserMessages],
      ["Repeated user prompts", summary.repeatedUserMessages.length],
      ["Providers", summary.providers.map((provider) => provider.provider).join(", ") || "none"],
      ["Classified prompt intents", summary.promptIntents.classifiedMessages],
      ["Unclassified prompt intents", summary.promptIntents.unclassifiedMessages],
      ["Input tokens", formatNumber(summary.tokens.inputTokens)],
      ["Cached input tokens", formatNumber(summary.tokens.cachedInputTokens)],
      ["Fresh input tokens", formatNumber(summary.tokens.freshInputTokens)],
      ["Output tokens", formatNumber(summary.tokens.outputTokens)],
      ["Reasoning tokens", formatNumber(summary.tokens.reasoningOutputTokens)],
      ["Total tokens", formatNumber(summary.tokens.totalTokens)],
      ["Unknown events", summary.totals.unknownEvents],
      ["Parse warnings", summary.totals.parseWarnings]
    ]
  );

  if (summary.models.length > 0) {
    process.stdout.write("\nModels\n");
    printTable(
      ["Model", "Turns", "Tokens"],
      summary.models.map((model) => [model.model, model.turns, formatNumber(model.tokens.totalTokens)])
    );
  }

  if (summary.promptIntents.buckets.length > 0) {
    process.stdout.write("\nProject Focus\n");
    printTable(
      ["Category", "Prompts", "Share"],
      summary.promptIntents.buckets.map((bucket) => [
        bucket.label,
        formatNumber(bucket.count),
        `${bucket.percentage.toFixed(1)}%`
      ])
    );
  }
}

function printTable(headers: string[], rows: Array<Array<string | number>>): void {
  const allRows = [headers, ...rows.map((row) => row.map(String))];
  const widths = headers.map((_, column) => Math.max(...allRows.map((row) => String(row[column] ?? "").length)));
  for (const [index, row] of allRows.entries()) {
    process.stdout.write(row.map((cell, column) => String(cell).padEnd(widths[column])).join("  ") + "\n");
    if (index === 0) {
      process.stdout.write(widths.map((width) => "-".repeat(width)).join("  ") + "\n");
    }
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(`Codex Log Viewer

Usage:
  codex-log-viewer projects [--provider all|codex|claude] [--path <file-or-dir>] [--json]
  codex-log-viewer summary [--provider all|codex|claude] [--project <name>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--path <file-or-dir>] [--json]
  codex-log-viewer sessions [--provider all|codex|claude] [--project <name>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--path <file-or-dir>] [--json]
  codex-log-viewer export [--format json|csv] [--output <file>] [summary options]
  codex-log-viewer export --format json --raw [summary options]
  codex-log-viewer audit [--provider all|codex|claude] [--repo <path>] [--project <name>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--output <file>] [--raw] [--no-responses]

Defaults scan ~/.codex/sessions and ~/.codex/archived_sessions.
Custom paths can include Codex JSONL and Claude Code JSONL.
`);
}

function jsonOutput(parsed: ParsedArgs): boolean {
  return parsed.options.json !== undefined || parsed.options.format === "json";
}

function stringOption(value: string | boolean | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function arrayOption(value: string | boolean | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" ? [value] : [];
}

function providerOption(value: string | boolean | string[] | undefined): SummaryOptions["provider"] {
  const provider = stringOption(value);
  return provider && provider !== "all" ? provider : undefined;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
