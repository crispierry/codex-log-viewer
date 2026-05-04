#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import {
  loadCorpus,
  summaryToCsv,
  summarizeParsedCorpus,
  summarizeProject,
  type ProjectSummary,
  type SummaryOptions
} from "@codex-log-viewer/analytics";
import { startServer } from "@codex-log-viewer/server";

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
    case "serve":
      await serveCommand(parsed);
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
    ["Project", "Sessions", "Turns", "Messages", "Tokens"],
    loaded.projects.map((project) => [
      project.project,
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
    ["Session", "Project", "User Msgs", "Tokens", "Last Seen"],
    summary.sessions.map((session) => [
      session.sessionId,
      session.project,
      session.userMessages,
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
  const body = format === "csv" ? summaryToCsv(summary) : `${JSON.stringify(summary, null, 2)}\n`;

  if (output) {
    await writeFile(output, body, "utf8");
    process.stdout.write(`Wrote ${output}\n`);
  } else {
    process.stdout.write(body);
  }
}

async function serveCommand(parsed: ParsedArgs): Promise<void> {
  const port = Number(parsed.options.port ?? 3210);
  const paths = arrayOption(parsed.options.path);
  const server = await startServer({ port, paths: paths.length > 0 ? paths : undefined });
  process.stdout.write(`Codex Log Viewer running at ${server.url}\n`);
  process.stdout.write("Press Ctrl+C to stop.\n");
}

function summaryOptions(parsed: ParsedArgs): SummaryOptions {
  const paths = arrayOption(parsed.options.path);
  return {
    paths: paths.length > 0 ? paths : undefined,
    project: stringOption(parsed.options.project),
    since: stringOption(parsed.options.since),
    until: stringOption(parsed.options.until)
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
      ["Assistant messages", summary.totals.assistantMessages],
      ["Unique user messages", summary.totals.uniqueUserMessages],
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
  codex-log-viewer projects [--path <file-or-dir>] [--json]
  codex-log-viewer summary [--project <name>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--path <file-or-dir>] [--json]
  codex-log-viewer sessions [--project <name>] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]
  codex-log-viewer export [--format json|csv] [--output <file>] [summary options]
  codex-log-viewer serve [--port 3210] [--path <file-or-dir>]

Defaults scan ~/.codex/sessions and ~/.codex/archived_sessions.
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
