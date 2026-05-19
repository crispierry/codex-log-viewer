import { basename, normalize } from "node:path";
import type { ParsedCodexCorpus, ParsedCodexFile, SessionRecord } from "@codex-log-viewer/parser";
import type { ProjectAlias, ProjectContext, ProjectListItem } from "./types.js";

const WORKTREE_PATTERN = /\/\.codex\/worktrees\/[^/]+\/([^/]+)$/;
type SessionLocator = { filePath: string; sessionId: string };

export function projectNameForCwd(cwd: string | undefined, aliases: ProjectAlias[] = []): string {
  if (!cwd) {
    return "Unknown Project";
  }

  const normalized = normalize(cwd);
  for (const alias of aliases) {
    if (alias.match.some((matcher) => normalized.includes(matcher))) {
      return alias.name;
    }
  }

  const worktreeMatch = normalized.match(WORKTREE_PATTERN);
  if (worktreeMatch?.[1]) {
    return worktreeMatch[1];
  }

  return basename(normalized);
}

export function projectContextForSession(
  sessionId: string,
  corpus: ParsedCodexCorpus,
  aliases: ProjectAlias[] = []
): ProjectContext {
  const file = corpus.files.find((candidate) => candidate.sessionId === sessionId);
  if (file) {
    return projectContextForFile(file, corpus, aliases);
  }

  const session = corpus.sessions.find((candidate) => candidate.sessionId === sessionId);
  const turn = corpus.turns.find((candidate) => candidate.sessionId === sessionId);
  const cwd = session?.cwd ?? turn?.cwd;
  return {
    session,
    cwd,
    project: projectNameForCwd(cwd, aliases)
  };
}

export function projectContextForFile(
  locator: SessionLocator,
  corpus: ParsedCodexCorpus,
  aliases: ProjectAlias[] = []
): ProjectContext {
  const session = corpus.sessions.find((candidate) => sameSessionFile(candidate, locator));
  const turn = corpus.turns.find((candidate) => sameSessionFile(candidate, locator));
  const cwd = session?.cwd ?? turn?.cwd;
  return {
    session,
    cwd,
    project: projectNameForCwd(cwd, aliases)
  };
}

export function sessionsById(corpus: ParsedCodexCorpus): Map<string, SessionRecord> {
  const byId = new Map<string, SessionRecord>();
  for (const session of corpus.sessions) {
    byId.set(session.sessionId, session);
  }
  return byId;
}

export function listProjects(corpus: ParsedCodexCorpus, aliases: ProjectAlias[] = []): ProjectListItem[] {
  const projects = new Map<string, ProjectListItem>();

  for (const file of corpus.files) {
    const context = projectContextForFile(file, corpus, aliases);
    const project = context.project;
    const existing = projects.get(project) ?? {
      project,
      cwdSamples: [],
      sessions: 0,
      turns: 0,
      messages: 0,
      totalTokens: 0,
      firstSeen: undefined,
      lastSeen: undefined
    };

    existing.sessions += dailySessionCount(file);
    existing.turns += file.turns.length;
    existing.messages += file.messages.filter((message) => message.sourceEvent === "event_msg.user_message").length;
    existing.totalTokens += file.tokenUsage.reduce((sum, token) => sum + token.usage.totalTokens, 0);
    for (const timestamp of projectActivityTimestamps(file)) {
      if (!existing.firstSeen || timestamp < existing.firstSeen) {
        existing.firstSeen = timestamp;
      }
      if (!existing.lastSeen || timestamp > existing.lastSeen) {
        existing.lastSeen = timestamp;
      }
    }
    if (context.cwd && !existing.cwdSamples.includes(context.cwd) && existing.cwdSamples.length < 5) {
      existing.cwdSamples.push(context.cwd);
    }
    projects.set(project, existing);
  }

  return [...projects.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.project.localeCompare(b.project));
}

function projectActivityTimestamps(file: ParsedCodexFile): string[] {
  return [
    ...file.sessions.map((session) => session.timestamp),
    ...file.messages.map((message) => message.timestamp),
    ...file.turns.map((turn) => turn.timestamp),
    ...file.tokenUsage.map((token) => token.timestamp)
  ].filter((timestamp): timestamp is string => typeof timestamp === "string" && timestamp.length > 0);
}

function sameSessionFile(record: SessionLocator, locator: SessionLocator): boolean {
  return record.sessionId === locator.sessionId && record.filePath === locator.filePath;
}

function dailySessionCount(file: ParsedCodexCorpus["files"][number]): number {
  const dateKeys = new Set<string>();
  for (const message of file.messages) {
    if (message.sourceEvent === "event_msg.user_message") {
      dateKeys.add(localDateKey(message.timestamp));
    }
  }
  return dateKeys.size;
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
