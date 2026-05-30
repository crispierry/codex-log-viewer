import { createHash } from "node:crypto";
import { basename, isAbsolute, normalize, relative } from "node:path";
import type { MessageRecord, ParsedLogCorpus, ParsedLogFile } from "@codex-log-viewer/parser";
import { projectContextForFile, projectNameForCwd } from "./project.js";
import type { ProjectAlias, SummaryOptions } from "./types.js";

export type AuditPrivacyMode = "public" | "raw";

export interface AuditMarkdownOptions extends SummaryOptions {
  repoPath?: string;
  includeResponses?: boolean;
  privacy?: AuditPrivacyMode;
  generatedAt?: string;
  title?: string;
}

export interface AuditMergeResult {
  markdown: string;
  appendedSections: number;
  skippedSections: number;
  existingSections: number;
  generatedSections: number;
}

interface AuditSessionEntry {
  file: ParsedLogFile;
  project: string;
  cwd?: string;
  firstSeen?: string;
  lastSeen?: string;
  models: string[];
  interactions: AuditInteraction[];
}

interface AuditInteraction {
  userMessage: MessageRecord;
  responses: MessageRecord[];
}

export function generateAuditMarkdown(corpus: ParsedLogCorpus, options: AuditMarkdownOptions = {}): string {
  const privacy = options.privacy ?? "public";
  const includeResponses = options.includeResponses !== false;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const entries = auditSessionEntries(corpus, options, includeResponses);
  const userMessageCount = entries.reduce((sum, entry) => sum + entry.interactions.length, 0);
  const responseCount = entries.reduce(
    (sum, entry) => sum + entry.interactions.reduce((inner, interaction) => inner + interaction.responses.length, 0),
    0
  );
  const title = options.title ?? "AI Worklog";
  const projectLabel = options.project ?? (options.repoPath ? basename(normalize(options.repoPath)) : "All Projects");
  const lines: string[] = [
    `# ${title}`,
    "",
    "Sanitized audit trail of AI-assisted work reconstructed from local AI system logs.",
    "",
    `Generated: ${generatedAt}`,
    `Project filter: ${projectLabel}`,
    `Provider filter: ${options.provider ?? "all"}`,
    `Providers: ${providerSummary(entries)}`,
    `Privacy mode: ${privacy}`,
    `Sessions: ${entries.length}`,
    `User messages: ${userMessageCount}`,
    `AI responses: ${includeResponses ? responseCount : "not included"}`,
    "",
    "> Review this file before committing it. Public mode preserves user intent while redacting obvious local home paths and contact or secret-like strings.",
    ""
  ];

  if (entries.length === 0) {
    lines.push("No matching submitted user messages were found.", "");
    return `${lines.join("\n").trimEnd()}\n`;
  }

  for (const entry of entries) {
    lines.push(`<!-- codex-log-viewer:audit-session ${auditSessionMarker(entry.file.filePath, entry.file.sessionId)} -->`);
    const dateLabel = localDateKey(entry.firstSeen ?? entry.lastSeen);
    lines.push(`## ${dateLabel} - ${entry.project}`, "");
    lines.push(`Provider: \`${redactInline(providerLabel(entry.file), privacy)}\``);
    if (entry.file.title) {
      lines.push(`Title: \`${redactInline(entry.file.title, privacy)}\``);
    }
    if (entry.file.providerConversationId && entry.file.providerConversationId !== entry.file.sessionId) {
      lines.push(`Provider conversation: \`${redactInline(entry.file.providerConversationId, privacy)}\``);
    }
    lines.push(`Session: \`${redactInline(entry.file.sessionId, privacy)}\``);
    if (entry.firstSeen) {
      lines.push(`First seen: ${entry.firstSeen}`);
    }
    if (entry.lastSeen) {
      lines.push(`Last seen: ${entry.lastSeen}`);
    }
    if (entry.cwd) {
      lines.push(`Working directory: \`${redactInline(entry.cwd, privacy)}\``);
    }
    if (entry.models.length > 0) {
      lines.push(`Models: ${entry.models.map((model) => `\`${redactInline(model, privacy)}\``).join(", ")}`);
    }
    lines.push("");

    entry.interactions.forEach((interaction, index) => {
      lines.push(`### User Message ${index + 1}`, "");
      if (interaction.userMessage.timestamp) {
        lines.push(`Timestamp: ${interaction.userMessage.timestamp}`, "");
      }
      lines.push(blockquote(redactText(interaction.userMessage.content, privacy)), "");

      if (!includeResponses) {
        return;
      }

      if (interaction.responses.length === 0) {
        lines.push("_No AI response was captured for this message in the parsed log._", "");
        return;
      }

      interaction.responses.forEach((response, responseIndex) => {
        const responseTitle = interaction.responses.length === 1
          ? "AI Response"
          : `AI Response ${responseIndex + 1}`;
        lines.push(`#### ${responseTitle}`, "");
        if (response.timestamp) {
          lines.push(`Timestamp: ${response.timestamp}`, "");
        }
        lines.push(blockquote(redactText(response.content, privacy)), "");
      });
    });
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function mergeAuditMarkdown(existingMarkdown: string | undefined, generatedMarkdown: string): AuditMergeResult {
  const existing = existingMarkdown?.trimEnd() ?? "";
  if (!existing) {
    const generatedSections = generatedAuditSections(generatedMarkdown);
    return {
      markdown: ensureTrailingNewline(generatedMarkdown),
      appendedSections: generatedSections.length,
      skippedSections: 0,
      existingSections: 0,
      generatedSections: generatedSections.length
    };
  }

  const generatedSections = generatedAuditSections(generatedMarkdown);
  const existingMarkers = new Set(generatedAuditSections(existing).map((section) => section.marker));
  const existingSessionIds = new Set(sessionIdsInMarkdown(existing));
  const existingQuoteBlocks = new Set(blockquoteBlocksInMarkdown(existing));
  const newSections = generatedSections.filter(
    (section) =>
      !existingMarkers.has(section.marker) &&
      !section.sessionIds.some((sessionId) => existingSessionIds.has(sessionId)) &&
      !sectionUserMessagesAlreadyExist(section.userMessages, existingQuoteBlocks)
  );

  if (newSections.length === 0) {
    return {
      markdown: ensureTrailingNewline(existing),
      appendedSections: 0,
      skippedSections: generatedSections.length,
      existingSections: existingMarkers.size,
      generatedSections: generatedSections.length
    };
  }

  const merged = [
    existing,
    "",
    ...newSections.map((section) => section.body.trimEnd())
  ].join("\n");

  return {
    markdown: ensureTrailingNewline(merged),
    appendedSections: newSections.length,
    skippedSections: generatedSections.length - newSections.length,
    existingSections: existingMarkers.size,
    generatedSections: generatedSections.length
  };
}

function auditSessionEntries(
  corpus: ParsedLogCorpus,
  options: AuditMarkdownOptions,
  includeResponses: boolean
): AuditSessionEntry[] {
  const aliases = options.aliases ?? [];
  const range = dateRange(options);
  const entries: AuditSessionEntry[] = [];

  for (const file of corpus.files) {
    if (!providerInScope(recordProvider(file), options.provider)) {
      continue;
    }

    const context = projectContextForFile(file, corpus, aliases);
    if (!projectInScope(file, context.project, context.cwd, options, aliases)) {
      continue;
    }

    const sessionMessages = corpus.messages
      .filter((message) => sameSessionFile(message, file))
      .sort(compareMessages);
    const scopedUserMessages = sessionMessages.filter(
      (message) => isSubmittedUserMessage(message) && timestampInRange(message.timestamp, range)
    );
    if (scopedUserMessages.length === 0) {
      continue;
    }

    const interactions = scopedUserMessages.map((userMessage) => ({
      userMessage,
      responses: includeResponses ? assistantResponsesForUserMessage(userMessage, sessionMessages) : []
    }));
    const timestamps = [
      context.session?.timestamp,
      ...interactions.flatMap((interaction) => [
        interaction.userMessage.timestamp,
        ...interaction.responses.map((response) => response.timestamp)
      ])
    ].filter((timestamp): timestamp is string => typeof timestamp === "string" && timestamp.length > 0).sort();
    const turnIds = new Set(
      interactions.flatMap((interaction) => [
        interaction.userMessage.turnId,
        ...interaction.responses.map((response) => response.turnId)
      ]).filter((turnId): turnId is string => typeof turnId === "string" && turnId.length > 0)
    );
    const models = corpus.turns
      .filter((turn) => sameSessionFile(turn, file) && turn.turnId && turnIds.has(turn.turnId))
      .map((turn) => turn.model)
      .filter((model): model is string => typeof model === "string" && model.length > 0);

    entries.push({
      file,
      project: context.project,
      cwd: context.cwd,
      firstSeen: timestamps[0],
      lastSeen: timestamps.at(-1),
      models: [...new Set(models)].sort((a, b) => a.localeCompare(b)),
      interactions
    });
  }

  return entries.sort(
    (a, b) =>
      (a.firstSeen ?? "").localeCompare(b.firstSeen ?? "") ||
      a.project.localeCompare(b.project) ||
      a.file.sessionId.localeCompare(b.file.sessionId)
  );
}

function projectInScope(
  file: ParsedLogFile,
  project: string,
  cwd: string | undefined,
  options: AuditMarkdownOptions,
  aliases: ProjectAlias[]
): boolean {
  if (options.project && options.project !== "All Projects" && project !== options.project) {
    return false;
  }
  if (!options.repoPath) {
    return true;
  }
  if (repoPathMatches(cwd, project, options.repoPath, aliases)) {
    return true;
  }
  return !cwd && recordProvider(file) !== "codex" && hasExplicitSourcePaths(options);
}

function repoPathMatches(
  cwd: string | undefined,
  project: string,
  repoPath: string,
  aliases: ProjectAlias[]
): boolean {
  const normalizedRepo = normalize(repoPath);
  const repoName = basename(normalizedRepo);
  if (!cwd) {
    return project === repoName;
  }

  const normalizedCwd = normalize(cwd);
  const relativePath = relative(normalizedRepo, normalizedCwd);
  const isInsideRepo = relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
  const isCodexWorktree = normalizedCwd.includes(`${normalize("/.codex/worktrees/")}`) &&
    projectNameForCwd(cwd, aliases) === repoName;
  return isInsideRepo || isCodexWorktree;
}

function assistantResponsesForUserMessage(
  userMessage: MessageRecord,
  sessionMessages: MessageRecord[]
): MessageRecord[] {
  const userIndex = sessionMessages.indexOf(userMessage);
  if (userIndex < 0) {
    return [];
  }
  const nextUserIndex = sessionMessages.findIndex(
    (message, index) => index > userIndex && isSubmittedUserMessage(message)
  );
  const upperBound = nextUserIndex < 0 ? sessionMessages.length : nextUserIndex;
  return sessionMessages
    .slice(userIndex + 1, upperBound)
    .filter((message) => message.role === "assistant" && message.content.trim().length > 0);
}

function isSubmittedUserMessage(message: MessageRecord): boolean {
  return message.role === "user" && (
    message.sourceEvent === "event_msg.user_message" ||
    message.sourceEvent === "claude.user_message"
  );
}

function providerInScope(provider: string, filter: SummaryOptions["provider"]): boolean {
  return !filter || filter === "all" || provider === filter;
}

function recordProvider(record: { provider?: string }): string {
  return record.provider ?? "codex";
}

function providerLabel(record: { provider?: string; sourceLabel?: string }): string {
  if (record.sourceLabel) {
    return record.sourceLabel;
  }
  switch (recordProvider(record)) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude Code";
    default:
      return recordProvider(record);
  }
}

function providerSummary(entries: AuditSessionEntry[]): string {
  const providers = [...new Set(entries.map((entry) => providerLabel(entry.file)))].sort((a, b) => a.localeCompare(b));
  return providers.length > 0 ? providers.join(", ") : "none";
}

function hasExplicitSourcePaths(options: AuditMarkdownOptions): boolean {
  return Array.isArray(options.paths) && options.paths.length > 0;
}

function dateRange(options: SummaryOptions): { since?: number; until?: number } {
  return {
    since: options.since ? startOfDate(options.since) : undefined,
    until: options.until ? endOfDate(options.until) : undefined
  };
}

function startOfDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00.000`);
  }
  return Date.parse(value);
}

function endOfDate(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T23:59:59.999`);
  }
  return Date.parse(value);
}

function timestampInRange(timestamp: string | undefined, range: { since?: number; until?: number }): boolean {
  if (!timestamp) {
    return true;
  }
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return true;
  }
  if (range.since !== undefined && value < range.since) {
    return false;
  }
  if (range.until !== undefined && value > range.until) {
    return false;
  }
  return true;
}

function compareMessages(a: MessageRecord, b: MessageRecord): number {
  return (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER) ||
    (a.timestamp ?? "").localeCompare(b.timestamp ?? "") ||
    a.sourceEvent.localeCompare(b.sourceEvent);
}

function sameSessionFile(
  record: { filePath: string; sessionId: string },
  file: { filePath: string; sessionId: string }
): boolean {
  return record.sessionId === file.sessionId && record.filePath === file.filePath;
}

function localDateKey(timestamp: string | undefined): string {
  if (!timestamp) {
    return "unknown";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function blockquote(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "> [empty message]";
  }
  return trimmed.split(/\r?\n/).map((line) => line.length > 0 ? `> ${line}` : ">").join("\n");
}

function redactInline(value: string, privacy: AuditPrivacyMode): string {
  return redactText(value, privacy).replace(/\s+/g, " ").trim();
}

function redactText(value: string, privacy: AuditPrivacyMode): string {
  if (privacy === "raw") {
    return value;
  }
  return value
    .replace(/\/Users\/[^/\s`]+/g, "~")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[redacted-token]")
    .replace(/\b(password|api[_-]?key|token|secret)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s`]+)/gi, "$1=[redacted-secret]");
}

function auditSessionMarker(filePath: string, sessionId: string): string {
  return createHash("sha256").update(`${filePath}\n${sessionId}`).digest("hex").slice(0, 16);
}

function generatedAuditSections(markdown: string): Array<{ marker: string; body: string; sessionIds: string[]; userMessages: string[] }> {
  const sections: Array<{ marker: string; body: string; sessionIds: string[]; userMessages: string[] }> = [];
  const markerPattern = /^<!-- codex-log-viewer:audit-session ([a-f0-9]+) -->$/gm;
  const markers = [...markdown.matchAll(markerPattern)];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const markerId = marker[1];
    const start = marker.index ?? 0;
    const next = markers[index + 1];
    const end = next?.index ?? markdown.length;
    const body = markdown.slice(start, end).trimEnd();
    if (markerId && body) {
      sections.push({
        marker: markerId,
        body,
        sessionIds: sessionIdsInMarkdown(body),
        userMessages: userMessageQuoteBlocksInGeneratedSection(body)
      });
    }
  }
  return sections;
}

function sessionIdsInMarkdown(markdown: string): string[] {
  return [...markdown.matchAll(/^Session: `([^`]+)`$/gm)]
    .map((match) => match[1])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function ensureTrailingNewline(value: string): string {
  return `${value.trimEnd()}\n`;
}

function sectionUserMessagesAlreadyExist(userMessages: string[], existingQuoteBlocks: Set<string>): boolean {
  return userMessages.length > 0 && userMessages.every((message) => existingQuoteBlocks.has(message));
}

function userMessageQuoteBlocksInGeneratedSection(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let inUserMessage = false;
  let current: string[] = [];

  const flush = () => {
    const normalized = normalizeBlockquoteLines(current);
    if (normalized) {
      blocks.push(normalized);
    }
    current = [];
  };

  for (const line of lines) {
    if (/^### User Message\b/.test(line)) {
      flush();
      inUserMessage = true;
      continue;
    }
    if (/^(### |#### |## |<!-- codex-log-viewer:audit-session )/.test(line)) {
      flush();
      if (!/^### User Message\b/.test(line)) {
        inUserMessage = false;
      }
      continue;
    }
    if (!inUserMessage) {
      continue;
    }
    if (line.startsWith(">")) {
      current.push(line);
    } else if (current.length > 0 && line.trim() === "") {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

function blockquoteBlocksInMarkdown(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(">")) {
      current.push(line);
      continue;
    }
    const normalized = normalizeBlockquoteLines(current);
    if (normalized) {
      blocks.push(normalized);
    }
    current = [];
  }
  const normalized = normalizeBlockquoteLines(current);
  if (normalized) {
    blocks.push(normalized);
  }
  return blocks;
}

function normalizeBlockquoteLines(lines: string[]): string | undefined {
  const text = lines
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim()
    .replace(/[ \t]+/g, " ");
  return text ? text : undefined;
}
