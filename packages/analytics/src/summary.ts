import { createHash } from "node:crypto";
import { parseCodexCorpus, parseCodexCorpusWithCache } from "@codex-log-viewer/parser";
import type {
  MessageRecord,
  ParsedCodexCorpus,
  ParsedCodexFile,
  TokenUsageRecord,
  TurnRecord
} from "@codex-log-viewer/parser";
import { defaultCodexLogRoots } from "@codex-log-viewer/parser";
import { classifyPromptIntent, promptIntentCategories } from "./prompt-intents.js";
import { listProjects, projectContextForFile, projectNameForCwd } from "./project.js";
import type {
  DateBucket,
  LoadedCorpus,
  MessageSearchOptions,
  MessageSearchResult,
  MessageSearchSummary,
  ModelBucket,
  PromptIntentCategory,
  PromptIntentSummary,
  ProjectAlias,
  ProjectListItem,
  ProjectSummary,
  RepeatedUserMessage,
  SessionSummary,
  SummaryOptions
} from "./types.js";
import { addUsage, emptyUsage } from "./usage.js";

const operationalPromptIntentCategoryKeys = new Set<string>([
  promptIntentCategories.codeReviewQa.key,
  promptIntentCategories.deployRelease.key,
  promptIntentCategories.gitCommands.key,
  promptIntentCategories.planApprovals.key,
  promptIntentCategories.runBuildApp.key,
  promptIntentCategories.testingVerification.key
]);

export async function loadCorpus(options: SummaryOptions = {}): Promise<LoadedCorpus> {
  if (options.cacheDir) {
    const loaded = await parseCodexCorpusWithCache({
      paths: options.paths,
      cacheDir: options.cacheDir,
      refreshCache: options.refreshCache,
      rebuildCache: options.rebuildCache
    });
    return {
      corpus: loaded.corpus,
      cache: loaded.cache,
      projects: listProjects(loaded.corpus, options.aliases)
    };
  }

  const corpus = await parseCodexCorpus({ paths: options.paths });
  return {
    corpus,
    projects: listProjects(corpus, options.aliases)
  };
}

export async function summarizeProject(options: SummaryOptions = {}): Promise<ProjectSummary> {
  const loaded = await loadCorpus(options);
  return summarizeParsedCorpus(loaded.corpus, options);
}

export function summarizeParsedCorpus(corpus: ParsedCodexCorpus, options: SummaryOptions = {}): ProjectSummary {
  const aliases = options.aliases ?? [];
  const project = options.project ?? "All Projects";
  const range = dateRange(options);
  const visibleFiles = corpus.files.filter((file) => {
    const context = projectContextForFile(file, corpus, aliases);
    return project === "All Projects" || context.project === project;
  });
  const visibleFilePaths = new Set(visibleFiles.map((file) => file.filePath));

  const turns = corpus.turns.filter((turn) => recordInScope(turn, visibleFilePaths, range));
  const turnModels = new Map(
    turns.map((turn) => [turnModelKey(turn.filePath, turn.sessionId, turn.turnId), turn.model ?? "unknown"])
  );
  const messages = corpus.messages.filter((message) => recordInScope(message, visibleFilePaths, range));
  const submittedUserMessages = messages.filter((message) => message.sourceEvent === "event_msg.user_message");
  const automationMessages = messages.filter((message) => message.sourceEvent === "event_msg.automation_message");
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const tokenUsage = corpus.tokenUsage.filter((token) => recordInScope(token, visibleFilePaths, range));
  const toolEvents = corpus.toolEvents.filter((event) => recordInScope(event, visibleFilePaths, range));
  const unknownEvents = corpus.unknownEvents.filter((event) => recordInScope(event, visibleFilePaths, range));

  const tokens = emptyUsage();
  for (const token of dedupeTokenEvents(tokenUsage)) {
    addUsage(tokens, token.usage);
  }

  const uniqueMessages = new Set(submittedUserMessages.map((message) => normalizeMessage(message.content)));
  const messagesByDay = bucketMessages(submittedUserMessages, "day", tokenUsage);
  const messagesByHour = bucketMessages(submittedUserMessages, "hour", tokenUsage);
  const tokensByDay = bucketTokens(tokenUsage, "day");
  const models = modelBuckets(turns, tokenUsage, turnModels);
  const sessions = sessionSummaries(corpus, visibleFiles, aliases, range);
  const activity = activityRange(sessions);
  const repeatedUserMessages = repeatedUserMessageGroups(submittedUserMessages, corpus, aliases);
  const promptIntents = promptIntentSummary(submittedUserMessages, corpus, aliases);
  const visibleSessionFilePaths = new Set(sessions.map((session) => session.filePath));
  const parseWarnings = corpus.warnings.filter((warning) => visibleSessionFilePaths.has(warning.filePath));

  return {
    project,
    generatedAt: new Date().toISOString(),
    activity,
    filters: {
      since: options.since,
      until: options.until,
      paths: options.paths ?? defaultCodexLogRoots()
    },
    totals: {
      sessions: sessions.length,
      turns: turns.length,
      userMessages: submittedUserMessages.length,
      automationMessages: automationMessages.length,
      assistantMessages: assistantMessages.length,
      uniqueUserMessages: uniqueMessages.size,
      toolEvents: toolEvents.length,
      unknownEvents: unknownEvents.length,
      parseWarnings: parseWarnings.length
    },
    tokens,
    messagesByDay,
    messagesByHour,
    tokensByDay,
    models,
    sessions,
    promptIntents,
    repeatedUserMessages
  };
}

function activityRange(sessions: SessionSummary[]): ProjectSummary["activity"] {
  const firstSeen = sessions
    .map((session) => session.firstSeen)
    .filter(Boolean)
    .sort()[0];
  const lastSeen = sessions
    .map((session) => session.lastSeen)
    .filter(Boolean)
    .sort()
    .at(-1);
  return {
    firstSeen,
    lastSeen
  };
}

export function projectsFromCorpus(corpus: ParsedCodexCorpus, aliases: ProjectAlias[] = []): ProjectListItem[] {
  return listProjects(corpus, aliases);
}

export function searchMessages(corpus: ParsedCodexCorpus, options: MessageSearchOptions = {}): MessageSearchSummary {
  const query = options.query?.trim() ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const aliases = options.aliases ?? [];
  const project = options.project && options.project !== "All Projects" ? options.project : "All Projects";
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const modelFilter = options.model?.trim();
  const sessionFilter = options.sessionId?.trim();
  const filePathFilter = options.filePath?.trim();
  const dateKeyFilter = options.dateKey?.trim();
  const hiddenCategories = new Set((options.hiddenCategories ?? []).map((category) => category.trim()).filter(Boolean));

  const range = dateRange(options);
  const sessionContexts = new Map<string, ReturnType<typeof projectContextForFile>>();
  const turnModels = new Map(
    corpus.turns.map((turn) => [turnModelKey(turn.filePath, turn.sessionId, turn.turnId), turn.model ?? "unknown"])
  );
  const matches: MessageSearchResult[] = [];

  for (const message of corpus.messages) {
    if (sessionFilter && message.sessionId !== sessionFilter) {
      continue;
    }
    if (filePathFilter && message.filePath !== filePathFilter) {
      continue;
    }

    const contextKey = sessionRecordKey(message.filePath, message.sessionId);
    const context = sessionContexts.get(contextKey) ?? projectContextForFile(message, corpus, aliases);
    sessionContexts.set(contextKey, context);

    if (project !== "All Projects" && context.project !== project) {
      continue;
    }

    if (options.role && options.role !== "all" && message.role !== options.role) {
      continue;
    }

    if (options.submittedOnly && message.sourceEvent !== "event_msg.user_message") {
      continue;
    }

    const model = message.turnId
      ? turnModels.get(turnModelKey(message.filePath, message.sessionId, message.turnId))
      : undefined;
    if (modelFilter && modelFilter !== "all" && (model ?? "unknown") !== modelFilter) {
      continue;
    }

    if (!timestampInRange(message.timestamp, range)) {
      continue;
    }

    const dateKey = localDateKey(message.timestamp);
    if (dateKeyFilter && dateKey !== dateKeyFilter) {
      continue;
    }

    if (normalizedQuery && !normalizeSearchText(message.content).includes(normalizedQuery)) {
      continue;
    }

    const category = message.sourceEvent === "event_msg.user_message"
      ? userMessageCategoryLabel(message.content)
      : undefined;
    if (category && hiddenCategories.has(category)) {
      continue;
    }
    const promptIntent = message.sourceEvent === "event_msg.user_message"
      ? classifyPromptIntent(message.content)
      : undefined;

    matches.push({
      id: [
        message.filePath,
        message.sessionId,
        message.lineNumber ?? "",
        message.turnId ?? "",
        message.timestamp ?? "",
        message.role,
        message.sourceEvent,
        matches.length
      ].join("#"),
      sessionId: message.sessionId,
      filePath: message.filePath,
      dateKey,
      project: context.project,
      cwd: context.cwd,
      lineNumber: message.lineNumber,
      turnId: message.turnId,
      model,
      timestamp: message.timestamp,
      role: message.role,
      sourceEvent: message.sourceEvent,
      category,
      promptIntentKey: promptIntent?.key,
      promptIntent: promptIntent?.label,
      snippet: snippetFor(message.content, query),
      content: message.content
    });
  }

  matches.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""));

  return {
    query,
    project,
    generatedAt: new Date().toISOString(),
    totalMatches: matches.length,
    limit,
    offset,
    results: matches.slice(offset, offset + limit)
  };
}

export function normalizeMessage(message: string): string {
  return userMessageGroup(message).key;
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) {
    return 100;
  }
  return Math.max(1, Math.min(10_000, Math.trunc(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (!offset || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}

function snippetFor(content: string, query: string): string {
  const trimmed = content.trim();
  if (!query.trim()) {
    const end = Math.min(trimmed.length, 240);
    const suffix = end < trimmed.length ? "..." : "";
    return `${trimmed.slice(0, end)}${suffix}`;
  }
  const matchIndex = normalizedMatchStart(trimmed, query);
  const start = matchIndex >= 0 ? Math.max(0, matchIndex - 32) : 0;
  const end = Math.min(trimmed.length, start + 240);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < trimmed.length ? "..." : "";
  return `${prefix}${trimmed.slice(start, end)}${suffix}`;
}

function normalizedMatchStart(content: string, query: string): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCharacters: string[] = [];
  const sourceIndexes: number[] = [];
  let previousWasWhitespace = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (/\s/.test(character)) {
      if (normalizedCharacters.length > 0 && !previousWasWhitespace) {
        normalizedCharacters.push(" ");
        sourceIndexes.push(index);
      }
      previousWasWhitespace = true;
      continue;
    }

    normalizedCharacters.push(character.toLowerCase());
    sourceIndexes.push(index);
    previousWasWhitespace = false;
  }

  while (normalizedCharacters.at(-1) === " ") {
    normalizedCharacters.pop();
    sourceIndexes.pop();
  }

  const matchIndex = normalizedCharacters.join("").indexOf(normalizedQuery);
  return matchIndex >= 0 ? sourceIndexes[matchIndex] ?? 0 : -1;
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

function repeatedUserMessageGroups(
  messages: MessageRecord[],
  corpus: ParsedCodexCorpus,
  aliases: ProjectAlias[]
): RepeatedUserMessage[] {
  const groups = new Map<
    string,
    {
      sample: string;
      category?: string;
      count: number;
      sessionIds: Set<string>;
      projects: Set<string>;
      firstSeen?: string;
      lastSeen?: string;
      variants: Map<
        string,
        {
          sample: string;
          count: number;
          firstSeen?: string;
          lastSeen?: string;
        }
      >;
    }
  >();

  for (const message of messages) {
    const messageGroup = userMessageGroup(message.content);
    if (!messageGroup.key) {
      continue;
    }

    const group = groups.get(messageGroup.key) ?? {
      sample: messageGroup.sample,
      category: messageGroup.category,
      count: 0,
      sessionIds: new Set<string>(),
      projects: new Set<string>(),
      firstSeen: message.timestamp,
      lastSeen: message.timestamp,
      variants: new Map()
    };
    const variant = group.variants.get(messageGroup.variantKey) ?? {
      sample: messageGroup.variantSample,
      count: 0,
      firstSeen: message.timestamp,
      lastSeen: message.timestamp
    };
    const project = projectContextForFile(message, corpus, aliases).project;
    group.count += 1;
    group.sessionIds.add(sessionRecordKey(message.filePath, message.sessionId));
    group.projects.add(project);
    group.firstSeen = earlierTimestamp(group.firstSeen, message.timestamp);
    group.lastSeen = laterTimestamp(group.lastSeen, message.timestamp);
    variant.count += 1;
    variant.firstSeen = earlierTimestamp(variant.firstSeen, message.timestamp);
    variant.lastSeen = laterTimestamp(variant.lastSeen, message.timestamp);
    group.variants.set(messageGroup.variantKey, variant);
    groups.set(messageGroup.key, group);
  }

  return [...groups.entries()]
    .filter(([, group]) => group.count > 1)
    .map(([normalized, group]) => ({
      id: repeatedMessageId(normalized),
      sample: group.sample,
      category: group.category,
      count: group.count,
      sessionCount: group.sessionIds.size,
      projects: [...group.projects].sort((a, b) => a.localeCompare(b)),
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
      variants: [...group.variants.values()].sort(
        (a, b) =>
          b.count - a.count ||
          (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") ||
          a.sample.localeCompare(b.sample)
      )
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") ||
        a.sample.localeCompare(b.sample)
    )
    .slice(0, 10);
}

function promptIntentSummary(
  messages: MessageRecord[],
  corpus: ParsedCodexCorpus,
  aliases: ProjectAlias[]
): PromptIntentSummary {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
      sessionIds: Set<string>;
      projects: Set<string>;
      examples: Map<string, string>;
      firstSeen?: string;
      lastSeen?: string;
    }
  >();

  for (const message of messages) {
    const category = classifyPromptIntent(message.content);
    const group = groups.get(category.key) ?? {
      key: category.key,
      label: category.label,
      count: 0,
      sessionIds: new Set<string>(),
      projects: new Set<string>(),
      examples: new Map<string, string>(),
      firstSeen: message.timestamp,
      lastSeen: message.timestamp
    };
    const sample = compactIntentExample(message.content);
    const normalizedSample = normalizeLiteralMessage(sample);
    const project = projectContextForFile(message, corpus, aliases).project;
    group.count += 1;
    group.sessionIds.add(sessionRecordKey(message.filePath, message.sessionId));
    group.projects.add(project);
    group.firstSeen = earlierTimestamp(group.firstSeen, message.timestamp);
    group.lastSeen = laterTimestamp(group.lastSeen, message.timestamp);
    if (sample && !group.examples.has(normalizedSample)) {
      group.examples.set(normalizedSample, sample);
    }
    groups.set(category.key, group);
  }

  const totalMessages = messages.length;
  const buckets = [...groups.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      count: group.count,
      percentage: totalMessages > 0 ? Math.round((group.count / totalMessages) * 1000) / 10 : 0,
      sessionCount: group.sessionIds.size,
      projects: [...group.projects].sort((a, b) => a.localeCompare(b)),
      examples: [...group.examples.values()].slice(0, 3),
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") ||
        a.label.localeCompare(b.label)
    );

  const unclassifiedMessages = groups.get(promptIntentCategories.other.key)?.count ?? 0;
  return {
    totalMessages,
    classifiedMessages: totalMessages - unclassifiedMessages,
    unclassifiedMessages,
    buckets
  };
}

function compactMessageSample(value: string): string {
  const compacted = value.trim().replace(/\s+/g, " ");
  return compacted.length > 240 ? `${compacted.slice(0, 237)}...` : compacted;
}

function compactIntentExample(value: string): string {
  const compacted = value.trim().replace(/\s+/g, " ");
  return compacted.length > 96 ? `${compacted.slice(0, 93)}...` : compacted;
}

function userMessageGroup(message: string): {
  key: string;
  sample: string;
  variantKey: string;
  variantSample: string;
  category?: string;
} {
  const normalized = normalizeLiteralMessage(message);
  const variantSample = compactMessageSample(message);
  const category = userMessageCategory(normalized);
  if (category) {
    return {
      key: `category:${category.key}`,
      sample: category.label,
      variantKey: normalized,
      variantSample,
      category: category.label
    };
  }

  return {
    key: normalized,
    sample: variantSample,
    variantKey: normalized,
    variantSample
  };
}

function normalizeLiteralMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
}

export function userMessageCategoryLabel(message: string): string | undefined {
  return userMessageCategory(normalizeLiteralMessage(message))?.label;
}

function userMessageCategory(normalized: string): PromptIntentCategory | undefined {
  const promptIntent = classifyPromptIntent(normalized);
  return operationalPromptIntentCategoryKeys.has(promptIntent.key) ? promptIntent : undefined;
}

function repeatedMessageId(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function earlierTimestamp(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }
  return candidate.localeCompare(current) < 0 ? candidate : current;
}

function laterTimestamp(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }
  return candidate.localeCompare(current) > 0 ? candidate : current;
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
    const model = token.turnId
      ? turnModels.get(turnModelKey(token.filePath, token.sessionId, token.turnId)) ?? "unknown"
      : "unknown";
    const bucket = buckets.get(model) ?? { model, turns: 0, tokens: emptyUsage() };
    addUsage(bucket.tokens, token.usage);
    buckets.set(model, bucket);
  }

  return [...buckets.values()].sort((a, b) => b.tokens.totalTokens - a.tokens.totalTokens || a.model.localeCompare(b.model));
}

function turnModelKey(filePath: string, sessionId: string, turnId: string): string {
  return sessionRecordKey(filePath, sessionId, turnId);
}

function sessionSummaries(
  corpus: ParsedCodexCorpus,
  files: ParsedCodexFile[],
  aliases: ProjectAlias[],
  range: { since?: number; until?: number }
): SessionSummary[] {
  const hasDateFilter = range.since !== undefined || range.until !== undefined;

  return files.flatMap((file) => {
    const sessionId = file.sessionId;
    const session = corpus.sessions.find((candidate) => sameSessionFile(candidate, file));
    const cwd = session?.cwd ?? corpus.turns.find((turn) => sameSessionFile(turn, file))?.cwd;
    const messages = corpus.messages.filter(
      (message) => sameSessionFile(message, file) && timestampInRange(message.timestamp, range)
    );
    const tokens = dedupeTokenEvents(
      corpus.tokenUsage.filter((token) => sameSessionFile(token, file) && timestampInRange(token.timestamp, range))
    );
    const turns = corpus.turns.filter((turn) => sameSessionFile(turn, file) && timestampInRange(turn.timestamp, range));
    const sessionTimestampInRange = session?.timestamp ? timestampInRange(session.timestamp, range) : false;
    const hasActivityInRange = sessionTimestampInRange || messages.length > 0 || tokens.length > 0 || turns.length > 0;

    if (hasDateFilter && !hasActivityInRange) {
      return [];
    }

    const buckets = new Map<
      string,
      {
        messages: MessageRecord[];
        tokens: TokenUsageRecord[];
        turns: TurnRecord[];
        timestamps: string[];
      }
    >();
    const bucketFor = (dateKey: string) => {
      const existing = buckets.get(dateKey);
      if (existing) {
        return existing;
      }
      const created = { messages: [], tokens: [], turns: [], timestamps: [] };
      buckets.set(dateKey, created);
      return created;
    };

    for (const message of messages) {
      const bucket = bucketFor(localDateKey(message.timestamp));
      bucket.messages.push(message);
      if (message.timestamp) {
        bucket.timestamps.push(message.timestamp);
      }
    }

    for (const token of tokens) {
      const bucket = bucketFor(localDateKey(token.timestamp));
      bucket.tokens.push(token);
      if (token.timestamp) {
        bucket.timestamps.push(token.timestamp);
      }
    }

    for (const turn of turns) {
      const bucket = bucketFor(localDateKey(turn.timestamp));
      bucket.turns.push(turn);
      if (turn.timestamp) {
        bucket.timestamps.push(turn.timestamp);
      }
    }

    if (sessionTimestampInRange && session?.timestamp) {
      const sessionDateKey = localDateKey(session.timestamp);
      if (buckets.has(sessionDateKey) || buckets.size === 0) {
        bucketFor(sessionDateKey).timestamps.push(session.timestamp);
      }
    }

    if (!hasDateFilter && buckets.size === 0) {
      bucketFor(localDateKey(session?.timestamp));
    }

    return [...buckets.entries()].flatMap(([dateKey, bucket]) => {
      const userMessages = bucket.messages.filter((message) => message.sourceEvent === "event_msg.user_message");
      if (userMessages.length === 0) {
        return [];
      }

      const sortedTimestamps = bucket.timestamps.sort();

      return {
        sessionId,
        filePath: file.filePath,
        dateKey,
        project: projectNameForCwd(cwd, aliases),
        cwd,
        firstSeen: sortedTimestamps[0],
        lastSeen: sortedTimestamps.at(-1),
        userMessages: userMessages.length,
        automationMessages: bucket.messages.filter((message) => message.sourceEvent === "event_msg.automation_message").length,
        assistantMessages: bucket.messages.filter((message) => message.role === "assistant").length,
        totalTokens: bucket.tokens.reduce((sum, token) => sum + token.usage.totalTokens, 0),
        models: [...new Set(bucket.turns.map((turn) => turn.model).filter(Boolean) as string[])]
      };
    });
  }).sort((a, b) =>
    (b.dateKey ?? "").localeCompare(a.dateKey ?? "") ||
    (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") ||
    a.sessionId.localeCompare(b.sessionId)
  );
}

function recordInScope(
  record: { filePath: string; timestamp?: string },
  visibleFilePaths: Set<string>,
  range: { since?: number; until?: number }
): boolean {
  return visibleFilePaths.has(record.filePath) && timestampInRange(record.timestamp, range);
}

function sameSessionFile(record: { filePath: string; sessionId: string }, file: { filePath: string; sessionId: string }): boolean {
  return record.sessionId === file.sessionId && record.filePath === file.filePath;
}

function sessionRecordKey(filePath: string, sessionId: string, suffix?: string): string {
  return suffix === undefined ? `${filePath}\n${sessionId}` : `${filePath}\n${sessionId}\n${suffix}`;
}
