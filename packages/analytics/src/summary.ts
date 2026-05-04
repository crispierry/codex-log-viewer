import { parseCodexCorpus } from "@codex-log-viewer/parser";
import type {
  MessageRecord,
  ParsedCodexCorpus,
  TokenUsageRecord,
  TurnRecord
} from "@codex-log-viewer/parser";
import { defaultCodexLogRoots } from "@codex-log-viewer/parser";
import { listProjects, projectContextForSession, projectNameForCwd } from "./project.js";
import type {
  DateBucket,
  LoadedCorpus,
  ModelBucket,
  ProjectAlias,
  ProjectListItem,
  ProjectSummary,
  SessionSummary,
  SummaryOptions
} from "./types.js";
import { addUsage, emptyUsage } from "./usage.js";

export async function loadCorpus(options: SummaryOptions = {}): Promise<LoadedCorpus> {
  const corpus = await parseCodexCorpus({ paths: options.paths });
  return {
    corpus,
    projects: listProjects(corpus, options.aliases)
  };
}

export async function summarizeProject(options: SummaryOptions = {}): Promise<ProjectSummary> {
  const corpus = await parseCodexCorpus({ paths: options.paths });
  return summarizeParsedCorpus(corpus, options);
}

export function summarizeParsedCorpus(corpus: ParsedCodexCorpus, options: SummaryOptions = {}): ProjectSummary {
  const aliases = options.aliases ?? [];
  const project = options.project ?? "All Projects";
  const range = dateRange(options);
  const sessionProjects = new Map<string, string>();

  for (const file of corpus.files) {
    const context = projectContextForSession(file.sessionId, corpus, aliases);
    sessionProjects.set(file.sessionId, context.project);
  }

  const sessionIds = new Set(
    corpus.files
      .filter((file) => project === "All Projects" || sessionProjects.get(file.sessionId) === project)
      .map((file) => file.sessionId)
  );

  const turns = corpus.turns.filter((turn) => sessionIds.has(turn.sessionId) && timestampInRange(turn.timestamp, range));
  const turnModels = new Map(turns.map((turn) => [turn.turnId, turn.model ?? "unknown"]));
  const messages = corpus.messages.filter(
    (message) => sessionIds.has(message.sessionId) && timestampInRange(message.timestamp, range)
  );
  const submittedUserMessages = messages.filter((message) => message.sourceEvent === "event_msg.user_message");
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const tokenUsage = corpus.tokenUsage.filter(
    (token) => sessionIds.has(token.sessionId) && timestampInRange(token.timestamp, range)
  );

  const tokens = emptyUsage();
  for (const token of dedupeTokenEvents(tokenUsage)) {
    addUsage(tokens, token.usage);
  }

  const uniqueMessages = new Set(submittedUserMessages.map((message) => normalizeMessage(message.content)));
  const messagesByDay = bucketMessages(submittedUserMessages, "day", tokenUsage);
  const messagesByHour = bucketMessages(submittedUserMessages, "hour", tokenUsage);
  const tokensByDay = bucketTokens(tokenUsage, "day");
  const models = modelBuckets(turns, tokenUsage, turnModels);
  const sessions = sessionSummaries(corpus, [...sessionIds], aliases, range);

  return {
    project,
    generatedAt: new Date().toISOString(),
    filters: {
      since: options.since,
      until: options.until,
      paths: options.paths ?? defaultCodexLogRoots()
    },
    totals: {
      sessions: sessions.length,
      turns: turns.length,
      userMessages: submittedUserMessages.length,
      assistantMessages: assistantMessages.length,
      uniqueUserMessages: uniqueMessages.size,
      toolEvents: corpus.toolEvents.filter((event) => sessionIds.has(event.sessionId)).length,
      unknownEvents: corpus.unknownEvents.filter((event) => sessionIds.has(event.sessionId)).length,
      parseWarnings: corpus.warnings.length
    },
    tokens,
    messagesByDay,
    messagesByHour,
    tokensByDay,
    models,
    sessions
  };
}

export function projectsFromCorpus(corpus: ParsedCodexCorpus, aliases: ProjectAlias[] = []): ProjectListItem[] {
  return listProjects(corpus, aliases);
}

export function normalizeMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
}

function dateRange(options: SummaryOptions): { since?: number; until?: number } {
  return {
    since: options.since ? Date.parse(options.since) : undefined,
    until: options.until ? endOfDate(options.until) : undefined
  };
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

function dedupeTokenEvents(events: TokenUsageRecord[]): TokenUsageRecord[] {
  const seen = new Set<string>();
  const result: TokenUsageRecord[] = [];
  for (const event of events) {
    const key = [
      event.filePath,
      event.timestamp,
      event.turnId,
      event.usage.inputTokens,
      event.usage.cachedInputTokens,
      event.usage.outputTokens,
      event.usage.reasoningOutputTokens,
      event.usage.totalTokens
    ].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(event);
    }
  }
  return result;
}

function bucketMessages(messages: MessageRecord[], grain: "day" | "hour", tokenUsage: TokenUsageRecord[]): DateBucket[] {
  const buckets = new Map<string, DateBucket>();

  for (const message of messages) {
    const key = bucketKey(message.timestamp, grain);
    const bucket = ensureBucket(buckets, key);
    bucket.count += 1;
    bucket.uniqueCount = 0;
  }

  const uniqueByBucket = new Map<string, Set<string>>();
  for (const message of messages) {
    const key = bucketKey(message.timestamp, grain);
    const set = uniqueByBucket.get(key) ?? new Set<string>();
    set.add(normalizeMessage(message.content));
    uniqueByBucket.set(key, set);
  }

  for (const token of dedupeTokenEvents(tokenUsage)) {
    addUsage(ensureBucket(buckets, bucketKey(token.timestamp, grain)).tokens, token.usage);
  }

  for (const [key, set] of uniqueByBucket.entries()) {
    ensureBucket(buckets, key).uniqueCount = set.size;
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function bucketTokens(tokenUsage: TokenUsageRecord[], grain: "day" | "hour"): DateBucket[] {
  const buckets = new Map<string, DateBucket>();
  for (const token of dedupeTokenEvents(tokenUsage)) {
    addUsage(ensureBucket(buckets, bucketKey(token.timestamp, grain)).tokens, token.usage);
  }
  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function ensureBucket(buckets: Map<string, DateBucket>, key: string): DateBucket {
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }
  const created = {
    key,
    count: 0,
    uniqueCount: 0,
    tokens: emptyUsage()
  };
  buckets.set(key, created);
  return created;
}

function bucketKey(timestamp: string | undefined, grain: "day" | "hour"): string {
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
  if (grain === "day") {
    return `${year}-${month}-${day}`;
  }
  const hour = String(date.getHours()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:00`;
}

function modelBuckets(
  turns: TurnRecord[],
  tokenUsage: TokenUsageRecord[],
  turnModels: Map<string, string>
): ModelBucket[] {
  const buckets = new Map<string, ModelBucket>();

  for (const turn of turns) {
    const model = turn.model ?? "unknown";
    const bucket = buckets.get(model) ?? { model, turns: 0, tokens: emptyUsage() };
    bucket.turns += 1;
    buckets.set(model, bucket);
  }

  for (const token of dedupeTokenEvents(tokenUsage)) {
    const model = token.turnId ? turnModels.get(token.turnId) ?? "unknown" : "unknown";
    const bucket = buckets.get(model) ?? { model, turns: 0, tokens: emptyUsage() };
    addUsage(bucket.tokens, token.usage);
    buckets.set(model, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.tokens.totalTokens - a.tokens.totalTokens || a.model.localeCompare(b.model));
}

function sessionSummaries(
  corpus: ParsedCodexCorpus,
  sessionIds: string[],
  aliases: ProjectAlias[],
  range: { since?: number; until?: number }
): SessionSummary[] {
  return sessionIds.map((sessionId) => {
    const file = corpus.files.find((candidate) => candidate.sessionId === sessionId);
    const session = corpus.sessions.find((candidate) => candidate.sessionId === sessionId);
    const cwd = session?.cwd ?? corpus.turns.find((turn) => turn.sessionId === sessionId)?.cwd;
    const messages = corpus.messages.filter(
      (message) => message.sessionId === sessionId && timestampInRange(message.timestamp, range)
    );
    const tokens = dedupeTokenEvents(
      corpus.tokenUsage.filter((token) => token.sessionId === sessionId && timestampInRange(token.timestamp, range))
    );
    const turns = corpus.turns.filter((turn) => turn.sessionId === sessionId);
    const timestamps = [
      ...messages.map((message) => message.timestamp),
      ...tokens.map((token) => token.timestamp),
      session?.timestamp
    ].filter(Boolean) as string[];

    return {
      sessionId,
      filePath: file?.filePath ?? "",
      project: projectNameForCwd(cwd, aliases),
      cwd,
      firstSeen: timestamps.sort()[0],
      lastSeen: timestamps.sort().at(-1),
      userMessages: messages.filter((message) => message.sourceEvent === "event_msg.user_message").length,
      assistantMessages: messages.filter((message) => message.role === "assistant").length,
      totalTokens: tokens.reduce((sum, token) => sum + token.usage.totalTokens, 0),
      models: [...new Set(turns.map((turn) => turn.model).filter(Boolean) as string[])]
    };
  }).sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}
