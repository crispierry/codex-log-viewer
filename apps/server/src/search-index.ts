import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { dirname, resolve } from "node:path";
import {
  classifyPromptIntent,
  projectContextForFile,
  userMessageCategoryLabel,
  type MessageSearchOptions,
  type MessageSearchResult,
  type MessageSearchSummary
} from "@codex-log-viewer/analytics";
import type { MessageRecord, ParsedCodexCorpus, TurnRecord } from "@codex-log-viewer/parser";

const INDEX_SCHEMA_VERSION = 3;

export interface SearchIndexHandle {
  search(options: MessageSearchOptions): MessageSearchSummary | undefined;
  close(): void;
}

export function openSearchIndex(corpus: ParsedCodexCorpus, indexPath: string): SearchIndexHandle {
  mkdirSync(dirname(indexPath), { recursive: true });
  const database = new DatabaseSync(indexPath);
  const fingerprint = corpusFingerprint(corpus);
  ensureSchema(database);
  if (indexNeedsRebuild(database, fingerprint)) {
    rebuildIndex(database, corpus, fingerprint);
  }
  return new SqliteSearchIndex(database);
}

export function openCurrentSearchIndex(corpus: ParsedCodexCorpus, indexPath: string): SearchIndexHandle | undefined {
  if (!existsSync(indexPath)) {
    return undefined;
  }
  const database = new DatabaseSync(indexPath);
  const fingerprint = corpusFingerprint(corpus);
  ensureSchema(database);
  if (indexNeedsRebuild(database, fingerprint)) {
    database.close();
    return undefined;
  }
  return new SqliteSearchIndex(database);
}

class SqliteSearchIndex implements SearchIndexHandle {
  constructor(private database: DatabaseSync) {}

  search(options: MessageSearchOptions): MessageSearchSummary | undefined {
    const query = options.query?.trim() ?? "";
    const normalizedQuery = normalizeSearchText(query);

    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);
    const where: string[] = [];
    const params: SQLInputValue[] = [];
    const project = options.project && options.project !== "All Projects" ? options.project : undefined;

    if (normalizedQuery) {
      where.push("m.normalized_content LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLikeValue(normalizedQuery)}%`);
    }
    if (project) {
      where.push("m.project = ?");
      params.push(project);
    }
    if (options.provider && options.provider !== "all") {
      where.push("m.provider = ?");
      params.push(options.provider);
    }
    if (options.role && options.role !== "all") {
      where.push("m.role = ?");
      params.push(options.role);
    }
    if (options.submittedOnly) {
      where.push("(m.source_event = 'event_msg.user_message' OR m.source_event = 'claude.user_message')");
    }
    if (options.model?.trim()) {
      where.push("COALESCE(m.model, 'unknown') = ?");
      params.push(options.model.trim());
    }
    if (options.sessionId?.trim()) {
      where.push("m.session_id = ?");
      params.push(options.sessionId.trim());
    }
    if (options.filePath?.trim()) {
      where.push("m.file_path = ?");
      params.push(options.filePath.trim());
    }
    if (options.dateKey?.trim()) {
      where.push("m.date_key = ?");
      params.push(options.dateKey.trim());
    }
    if (options.since) {
      where.push("(m.timestamp IS NULL OR m.timestamp >= ?)");
      params.push(startOfDate(options.since));
    }
    if (options.until) {
      where.push("(m.timestamp IS NULL OR m.timestamp <= ?)");
      params.push(endOfDate(options.until));
    }
    for (const category of options.hiddenCategories ?? []) {
      where.push("(m.category IS NULL OR m.category != ?)");
      params.push(category);
    }

    const fromClause = "messages m";
    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const totalMatches = Number(
      this.database.prepare(`SELECT COUNT(*) AS count FROM ${fromClause}${whereClause}`).get(...params)?.count ?? 0
    );
    const rows = this.database.prepare(
      `SELECT m.* FROM ${fromClause}${whereClause} ORDER BY COALESCE(m.timestamp, '') DESC, m.id ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as unknown as IndexedMessageRow[];

    return {
      query,
      project: project ?? "All Projects",
      generatedAt: new Date().toISOString(),
      totalMatches,
      limit,
      offset,
      results: rows.map((row) => indexedRowToSearchResult(row, query))
    };
  }

  close(): void {
    this.database.close();
  }
}

interface IndexedMessageRow {
  id: string;
  provider: string;
  source_label: string | null;
  title: string | null;
  provider_conversation_id: string | null;
  session_id: string;
  file_path: string;
  date_key: string;
  project: string;
  cwd: string | null;
  line_number: number | null;
  turn_id: string | null;
  model: string | null;
  timestamp: string | null;
  role: MessageRecord["role"];
  source_event: string;
  category: string | null;
  prompt_intent_key: string | null;
  prompt_intent: string | null;
  content: string;
}

function ensureSchema(database: DatabaseSync): void {
  database.exec("PRAGMA journal_mode = WAL;");
  resetSearchSchemaIfNeeded(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      source_label TEXT,
      title TEXT,
      provider_conversation_id TEXT,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      date_key TEXT NOT NULL,
      project TEXT NOT NULL,
      cwd TEXT,
      line_number INTEGER,
      turn_id TEXT,
      model TEXT,
      timestamp TEXT,
      role TEXT NOT NULL,
      source_event TEXT NOT NULL,
      category TEXT,
      prompt_intent_key TEXT,
      prompt_intent TEXT,
      normalized_content TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_browse_idx
      ON messages(provider, project, source_event, timestamp DESC);
    CREATE INDEX IF NOT EXISTS messages_session_idx
      ON messages(session_id, file_path, date_key);
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
      USING fts5(content, content='messages', content_rowid='rowid');
  `);
}

function resetSearchSchemaIfNeeded(database: DatabaseSync): void {
  const table = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
  if (!table) {
    return;
  }

  const columns = new Set(
    (database.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>)
      .map((column) => column.name)
  );
  const requiredColumns = [
    "provider",
    "source_label",
    "title",
    "provider_conversation_id"
  ];
  if (requiredColumns.every((column) => columns.has(column))) {
    return;
  }

  database.exec(`
    DROP TABLE IF EXISTS messages_fts;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS metadata;
  `);
}

function indexNeedsRebuild(database: DatabaseSync, fingerprint: string): boolean {
  const version = metadataValue(database, "schemaVersion");
  const currentFingerprint = metadataValue(database, "fingerprint");
  return version !== String(INDEX_SCHEMA_VERSION) || currentFingerprint !== fingerprint;
}

function rebuildIndex(database: DatabaseSync, corpus: ParsedCodexCorpus, fingerprint: string): void {
  const turnModels = new Map(
    corpus.turns.map((turn) => [turnModelKey(turn), turn.model ?? "unknown"])
  );
  const insert = database.prepare(`
    INSERT INTO messages (
      id, provider, source_label, title, provider_conversation_id, session_id, file_path, date_key, project, cwd, line_number, turn_id,
      model, timestamp, role, source_event, category, prompt_intent_key, prompt_intent, normalized_content, content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM messages_fts; DELETE FROM messages; DELETE FROM metadata;");
    for (const [index, message] of corpus.messages.entries()) {
      const context = projectContextForFile(message, corpus);
      const promptIntent = message.provider === "codex" && message.sourceEvent === "event_msg.user_message"
        ? classifyPromptIntent(message.content)
        : undefined;
      insert.run(
        searchResultId(message, index),
        message.provider,
        message.sourceLabel ?? null,
        message.title ?? null,
        message.providerConversationId ?? null,
        message.sessionId,
        message.filePath,
        localDateKey(message.timestamp),
        context.project,
        context.cwd ?? null,
        message.lineNumber ?? null,
        message.turnId ?? null,
        message.turnId ? turnModels.get(turnModelKey({
          filePath: message.filePath,
          sessionId: message.sessionId,
          turnId: message.turnId
        })) ?? "unknown" : null,
        message.timestamp ?? null,
        message.role,
        message.sourceEvent,
        message.provider === "codex" && message.sourceEvent === "event_msg.user_message" ? userMessageCategoryLabel(message.content) ?? null : null,
        promptIntent?.key ?? null,
        promptIntent?.label ?? null,
        normalizeSearchText(message.content),
        message.content
      );
    }
    database.exec("INSERT INTO messages_fts(messages_fts) VALUES('rebuild');");
    setMetadataValue(database, "schemaVersion", String(INDEX_SCHEMA_VERSION));
    setMetadataValue(database, "fingerprint", fingerprint);
    setMetadataValue(database, "updatedAt", new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function indexedRowToSearchResult(row: IndexedMessageRow, query: string): MessageSearchResult {
  return {
    id: row.id,
    provider: row.provider,
    sourceLabel: row.source_label ?? undefined,
    title: row.title ?? undefined,
    providerConversationId: row.provider_conversation_id ?? undefined,
    sessionId: row.session_id,
    filePath: row.file_path,
    dateKey: row.date_key,
    project: row.project,
    cwd: row.cwd ?? undefined,
    lineNumber: row.line_number ?? undefined,
    turnId: row.turn_id ?? undefined,
    model: row.model ?? undefined,
    timestamp: row.timestamp ?? undefined,
    role: row.role,
    sourceEvent: row.source_event,
    category: row.category ?? undefined,
    promptIntentKey: row.prompt_intent_key ?? undefined,
    promptIntent: row.prompt_intent ?? undefined,
    snippet: snippetFor(row.content, query),
    content: row.content
  };
}

function metadataValue(database: DatabaseSync, key: string): string | undefined {
  return database.prepare("SELECT value FROM metadata WHERE key = ?").get(key)?.value as string | undefined;
}

function setMetadataValue(database: DatabaseSync, key: string, value: string): void {
  database.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run(key, value);
}

function corpusFingerprint(corpus: ParsedCodexCorpus): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    files: corpus.files.map((file) => ({
      filePath: file.filePath,
      provider: file.provider,
      sessionId: file.sessionId,
      lineCount: file.lineCount,
      messages: file.messages.length,
      turns: file.turns.length,
      tokenUsage: file.tokenUsage.length,
      lastTimestamp: latestTimestamp(file.messages.map((message) => message.timestamp))
    }))
  }));
  return hash.digest("hex");
}

function latestTimestamp(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function searchResultId(message: MessageRecord, index: number): string {
  return [
    message.filePath,
    message.provider,
    message.sessionId,
    message.lineNumber ?? "",
    message.turnId ?? "",
    message.timestamp ?? "",
    message.role,
    message.sourceEvent,
    index
  ].join("#");
}

function snippetFor(content: string, query: string): string {
  const trimmed = content.trim();
  if (!query.trim()) {
    const end = Math.min(trimmed.length, 240);
    const suffix = end < trimmed.length ? "..." : "";
    return `${trimmed.slice(0, end)}${suffix}`;
  }
  const normalized = normalizeSearchText(trimmed);
  const matchIndex = normalized.indexOf(normalizeSearchText(query));
  const start = matchIndex >= 0 ? Math.max(0, matchIndex - 32) : 0;
  const end = Math.min(trimmed.length, start + 240);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < trimmed.length ? "..." : "";
  return `${prefix}${trimmed.slice(start, end)}${suffix}`;
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeLikeValue(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
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

function startOfDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000` : value;
}

function endOfDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999` : value;
}

function turnModelKey(record: Pick<TurnRecord, "filePath" | "sessionId" | "turnId">): string {
  return `${record.filePath}\n${record.sessionId}\n${record.turnId}`;
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

export function searchIndexPath(cacheDir: string, sourceKey: string): string {
  const indexKey = createHash("sha256").update(sourceKey).digest("hex").slice(0, 16);
  return resolve(cacheDir, "search-index-v1", `${indexKey}.sqlite`);
}
