import { basename, normalize } from "node:path";
import type { ParsedCodexCorpus, SessionRecord } from "@codex-log-viewer/parser";
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
      totalTokens: 0
    };

    existing.sessions += 1;
    existing.turns += file.turns.length;
    existing.messages += file.messages.filter((message) => message.sourceEvent === "event_msg.user_message").length;
    existing.totalTokens += file.tokenUsage.reduce((sum, token) => sum + token.usage.totalTokens, 0);
    if (context.cwd && !existing.cwdSamples.includes(context.cwd) && existing.cwdSamples.length < 5) {
      existing.cwdSamples.push(context.cwd);
    }
    projects.set(project, existing);
  }

  return [...projects.values()].sort((a, b) => b.totalTokens - a.totalTokens || a.project.localeCompare(b.project));
}

function sameSessionFile(record: SessionLocator, locator: SessionLocator): boolean {
  return record.sessionId === locator.sessionId && record.filePath === locator.filePath;
}
