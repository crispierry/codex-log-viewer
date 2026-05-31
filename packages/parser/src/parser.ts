import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { discoverCodexLogFiles, discoverLogFiles } from "./discover.js";
import type {
  JsonObject,
  MessageRecord,
  ParsedCodexCorpus,
  ParsedCodexFile,
  ParsedLogFile,
  ParseOptions,
  ParseWarning,
  ProviderFilter,
  ProviderId,
  ProviderMetadata,
  SessionRecord,
  TaskTimingRecord,
  TokenUsage,
  TokenUsageRecord,
  ToolEventRecord,
  TurnRecord,
  UnknownEventRecord
} from "./types.js";

interface ParseState extends ProviderMetadata {
  sessionId: string;
  currentTurnId?: string;
  sessionCwd?: string;
  sessionAdded?: boolean;
}

const CODEX_METADATA: ProviderMetadata = {
  provider: "codex",
  inputKind: "codex-jsonl",
  sourceLabel: "Codex"
};

const CLAUDE_METADATA: ProviderMetadata = {
  provider: "claude",
  inputKind: "claude-jsonl",
  sourceLabel: "Claude Code"
};

const CURSOR_VSCDB_METADATA: ProviderMetadata = {
  provider: "cursor",
  inputKind: "cursor-vscdb",
  sourceLabel: "Cursor"
};

const CURSOR_MARKDOWN_METADATA: ProviderMetadata = {
  provider: "cursor",
  inputKind: "cursor-markdown",
  sourceLabel: "Cursor"
};

const KNOWN_EVENT_TYPES = new Set([
  "session_meta",
  "turn_context",
  "event_msg",
  "response_item"
]);

const KNOWN_PAYLOAD_TYPES = new Set([
  "agent_message",
  "custom_tool_call",
  "custom_tool_call_output",
  "exec_command_end",
  "function_call",
  "function_call_output",
  "message",
  "patch_apply_end",
  "reasoning",
  "task_complete",
  "task_started",
  "thread_name_updated",
  "token_count",
  "user_message"
]);

const CLAUDE_KNOWN_RECORD_TYPES = new Set([
  "assistant",
  "attachment",
  "queue-operation",
  "summary",
  "system",
  "title",
  "user"
]);

const USER_REQUEST_MARKER = "## My request for Codex:";

export async function parseCodexCorpus(options: ParseOptions = {}): Promise<ParsedCodexCorpus> {
  const files = await discoverCodexLogFiles(options.paths);
  const parsedFiles = await Promise.all(files.map((file) => parseCodexLogFile(file)));
  return corpusFromFiles(parsedFiles);
}

export async function parseLogCorpus(options: ParseOptions = {}): Promise<ParsedCodexCorpus> {
  const provider = providerForDiscovery(options);
  const files = await discoverLogFiles(options.paths, provider, options.homeDir);
  const parsedFileGroups = await Promise.all(files.map((file) => parseLogFile(file)));
  return corpusFromFiles(parsedFileGroups.flat().filter((file) => providerMatches(file.provider, provider)));
}

export async function parseLogFile(filePath: string, provider: ProviderFilter = "all"): Promise<ParsedLogFile[]> {
  const parsed = await parseDetectedLogFile(filePath);
  return parsed.filter((file) => providerMatches(file.provider, provider));
}

async function parseDetectedLogFile(filePath: string): Promise<ParsedLogFile[]> {
  if (filePath.endsWith(".vscdb")) {
    return parseCursorVscdbFile(filePath);
  }

  if (filePath.endsWith(".md")) {
    return [await parseCursorMarkdownFile(filePath)];
  }

  if (await looksLikeClaudeJsonl(filePath)) {
    return [await parseClaudeLogFile(filePath)];
  }

  return [await parseCodexLogFile(filePath)];
}

export async function parseCodexLogFile(filePath: string): Promise<ParsedCodexFile> {
  const state: ParseState = { ...CODEX_METADATA, sessionId: sessionIdFromFile(filePath) };
  const sessions: SessionRecord[] = [];
  const turns: TurnRecord[] = [];
  const messages: MessageRecord[] = [];
  const tokenUsage: TokenUsageRecord[] = [];
  const taskTimings = new Map<string, TaskTimingRecord>();
  const toolEvents: ToolEventRecord[] = [];
  const unknownEvents: UnknownEventRecord[] = [];
  const warnings: ParseWarning[] = [];
  let lineCount = 0;

  const reader = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    lineCount += 1;
    if (!line.trim()) {
      continue;
    }

    const raw = parseLine(line, filePath, lineCount, warnings, CODEX_METADATA);
    if (!raw) {
      continue;
    }

    classifyCodexEvent({
      raw,
      filePath,
      lineNumber: lineCount,
      state,
      sessions,
      turns,
      messages,
      tokenUsage,
      taskTimings,
      toolEvents,
      unknownEvents
    });
  }

  return {
    ...CODEX_METADATA,
    filePath,
    sessionId: state.sessionId,
    lineCount,
    sessions,
    turns,
    messages,
    tokenUsage,
    taskTimings: [...taskTimings.values()],
    toolEvents,
    unknownEvents,
    warnings
  };
}

async function parseClaudeLogFile(filePath: string): Promise<ParsedCodexFile> {
  const state: ParseState = { ...CLAUDE_METADATA, sessionId: sessionIdFromFile(filePath) };
  const sessions: SessionRecord[] = [];
  const turns: TurnRecord[] = [];
  const messages: MessageRecord[] = [];
  const tokenUsage: TokenUsageRecord[] = [];
  const toolEvents: ToolEventRecord[] = [];
  const unknownEvents: UnknownEventRecord[] = [];
  const warnings: ParseWarning[] = [];
  let lineCount = 0;

  const reader = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    lineCount += 1;
    if (!line.trim()) {
      continue;
    }

    const raw = parseLine(line, filePath, lineCount, warnings, CLAUDE_METADATA);
    if (!raw) {
      continue;
    }

    classifyClaudeRecord({
      raw,
      filePath,
      lineNumber: lineCount,
      state,
      sessions,
      turns,
      messages,
      tokenUsage,
      taskTimings: new Map<string, TaskTimingRecord>(),
      toolEvents,
      unknownEvents
    });
  }

  if (!state.sessionAdded) {
    ensureProviderSession(filePath, state, sessions);
  }

  return {
    ...CLAUDE_METADATA,
    filePath,
    sessionId: state.sessionId,
    lineCount,
    sessions,
    turns,
    messages,
    tokenUsage,
    taskTimings: [],
    toolEvents,
    unknownEvents,
    warnings
  };
}

interface CursorComposerHeader {
  composerId: string;
  title?: string;
  timestamp?: string;
  updatedAt?: string;
  cwd?: string;
}

interface CursorBubble {
  rowNumber: number;
  bubbleId: string;
  raw: JsonObject;
}

async function parseCursorVscdbFile(filePath: string): Promise<ParsedLogFile[]> {
  const warnings: ParseWarning[] = [];
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(filePath, { readOnly: true });
  } catch (error) {
    warnings.push({
      ...CURSOR_VSCDB_METADATA,
      filePath,
      lineNumber: 0,
      code: "cursor_vscdb_open_failed",
      message: errorMessage(error)
    });
    return [emptyParsedFile(filePath, CURSOR_VSCDB_METADATA, warnings)];
  }

  try {
    if (!sqliteTableExists(database, "cursorDiskKV")) {
      warnings.push({
        ...CURSOR_VSCDB_METADATA,
        filePath,
        lineNumber: 0,
        code: "unsupported_cursor_vscdb",
        message: "Cursor SQLite database does not contain cursorDiskKV chat storage."
      });
      return [emptyParsedFile(filePath, CURSOR_VSCDB_METADATA, warnings)];
    }

    const headers = await cursorComposerHeaders(database, filePath);
    const bubblesByComposer = cursorBubblesByComposer(database, filePath, warnings);
    const sessionIds = [...new Set([...headers.keys(), ...bubblesByComposer.keys()])].sort((a, b) => {
      const aTimestamp = headers.get(a)?.timestamp ?? "";
      const bTimestamp = headers.get(b)?.timestamp ?? "";
      return aTimestamp.localeCompare(bTimestamp) || a.localeCompare(b);
    });

    if (sessionIds.length === 0) {
      warnings.push({
        ...CURSOR_VSCDB_METADATA,
        filePath,
        lineNumber: 0,
        code: "cursor_vscdb_no_chats",
        message: "No Cursor chat bubbles were found in cursorDiskKV."
      });
      return [emptyParsedFile(filePath, CURSOR_VSCDB_METADATA, warnings)];
    }

    const parsedFiles = sessionIds
      .map((sessionId, index) => cursorParsedFileForSession(filePath, sessionId, headers.get(sessionId), bubblesByComposer.get(sessionId) ?? [], index === 0 ? warnings : []))
      .filter((file) => file.messages.length > 0 || file.warnings.length > 0);

    return parsedFiles.length > 0 ? parsedFiles : [emptyParsedFile(filePath, CURSOR_VSCDB_METADATA, warnings)];
  } catch (error) {
    warnings.push({
      ...CURSOR_VSCDB_METADATA,
      filePath,
      lineNumber: 0,
      code: "cursor_vscdb_parse_failed",
      message: errorMessage(error)
    });
    return [emptyParsedFile(filePath, CURSOR_VSCDB_METADATA, warnings)];
  } finally {
    database.close();
  }
}

async function parseCursorMarkdownFile(filePath: string): Promise<ParsedCodexFile> {
  const warnings: ParseWarning[] = [];
  const text = await readFile(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const sessionId = sessionIdFromFile(filePath);
  const state: ParseState = {
    ...CURSOR_MARKDOWN_METADATA,
    sessionId,
    providerConversationId: sessionId,
    title: markdownTitle(lines) ?? basename(filePath)
  };
  const sessions: SessionRecord[] = [];
  const messages: MessageRecord[] = [];
  let current: { role: "user" | "assistant"; startLine: number; lines: string[] } | undefined;

  const flush = (): void => {
    if (!current) {
      return;
    }
    const content = current.lines.join("\n").trim();
    if (content) {
      messages.push({
        ...CURSOR_MARKDOWN_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId,
        filePath,
        sessionId,
        lineNumber: current.startLine,
        role: current.role,
        sourceEvent: cursorSourceEvent(current.role),
        content,
        imagesCount: 0,
        localImagesCount: 0
      });
    }
    current = undefined;
  };

  lines.forEach((line, index) => {
    const role = cursorMarkdownRoleHeading(line);
    if (role) {
      flush();
      current = { role, startLine: index + 1, lines: [] };
      return;
    }

    const inline = cursorMarkdownInlineRole(line);
    if (inline) {
      flush();
      current = { role: inline.role, startLine: index + 1, lines: inline.content ? [inline.content] : [] };
      return;
    }

    if (current) {
      current.lines.push(line);
    }
  });
  flush();

  if (messages.length === 0) {
    warnings.push({
      ...CURSOR_MARKDOWN_METADATA,
      title: state.title,
      providerConversationId: state.providerConversationId,
      filePath,
      lineNumber: 0,
      code: "cursor_markdown_no_messages",
      message: "No Cursor Markdown user or assistant sections were found."
    });
  }

  ensureProviderSession(filePath, state, sessions);

  return {
    ...CURSOR_MARKDOWN_METADATA,
    title: state.title,
    providerConversationId: state.providerConversationId,
    filePath,
    sessionId,
    lineCount: lines.length,
    sessions,
    turns: [],
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings
  };
}

function parseLine(
  line: string,
  filePath: string,
  lineNumber: number,
  warnings: ParseWarning[],
  metadata: ProviderMetadata
): JsonObject | undefined {
  try {
    const parsed = JSON.parse(line);
    return isObject(parsed) ? parsed : undefined;
  } catch (error) {
    warnings.push({
      ...metadata,
      filePath,
      lineNumber,
      code: "malformed_json",
      message: errorMessage(error)
    });
    return undefined;
  }
}

interface ClassifyContext {
  raw: JsonObject;
  filePath: string;
  lineNumber: number;
  state: ParseState;
  sessions: SessionRecord[];
  turns: TurnRecord[];
  messages: MessageRecord[];
  tokenUsage: TokenUsageRecord[];
  taskTimings: Map<string, TaskTimingRecord>;
  toolEvents: ToolEventRecord[];
  unknownEvents: UnknownEventRecord[];
}

function classifyCodexEvent(context: ClassifyContext): void {
  const { raw, filePath, lineNumber, state } = context;
  const timestamp = stringValue(raw.timestamp);
  const topLevelType = stringValue(raw.type);
  const payload = objectValue(raw.payload);
  const payloadType = stringValue(payload?.type);

  if (topLevelType && !KNOWN_EVENT_TYPES.has(topLevelType)) {
    addUnknown(context, timestamp, topLevelType, payloadType);
    return;
  }

  if (payloadType && !KNOWN_PAYLOAD_TYPES.has(payloadType)) {
    addUnknown(context, timestamp, topLevelType, payloadType);
  }

  if (topLevelType === "session_meta" && payload) {
    const sessionId = stringValue(payload.id) ?? state.sessionId;
    state.sessionId = sessionId;
    state.sessionCwd = stringValue(payload.cwd);
    context.sessions.push({
      ...CODEX_METADATA,
      filePath,
      sessionId,
      timestamp: stringValue(payload.timestamp) ?? timestamp,
      cwd: state.sessionCwd,
      originator: stringValue(payload.originator),
      cliVersion: stringValue(payload.cli_version),
      source: stringValue(payload.source),
      modelProvider: stringValue(payload.model_provider)
    });
    return;
  }

  if (topLevelType === "turn_context" && payload) {
    const turnId = stringValue(payload.turn_id);
    if (turnId) {
      state.currentTurnId = turnId;
      context.turns.push({
        ...CODEX_METADATA,
        filePath,
        sessionId: state.sessionId,
        turnId,
        timestamp,
        cwd: stringValue(payload.cwd) ?? state.sessionCwd,
        currentDate: stringValue(payload.current_date),
        timezone: stringValue(payload.timezone),
        model: stringValue(payload.model),
        effort: stringValue(payload.effort),
        collaborationMode: stringValue(objectValue(payload.collaboration_mode)?.mode)
      });
    }
    return;
  }

  if (!payload) {
    addUnknown(context, timestamp, topLevelType, payloadType);
    return;
  }

  if (payloadType === "task_started") {
    const turnId = stringValue(payload.turn_id);
    if (turnId) {
      state.currentTurnId = turnId;
      const current = timingFor(context.taskTimings, filePath, state.sessionId, turnId, CODEX_METADATA);
      current.startedAt = numberValue(payload.started_at);
    }
    return;
  }

  if (payloadType === "task_complete") {
    const turnId = stringValue(payload.turn_id) ?? state.currentTurnId;
    if (turnId) {
      const current = timingFor(context.taskTimings, filePath, state.sessionId, turnId, CODEX_METADATA);
      current.completedAt = numberValue(payload.completed_at);
      current.durationMs = numberValue(payload.duration_ms);
      current.timeToFirstTokenMs = numberValue(payload.time_to_first_token_ms);
      current.lastAgentMessage = stringValue(payload.last_agent_message);
    }
    return;
  }

  if (payloadType === "user_message") {
    const content = submittedUserMessageContent(payload.message);
    const isAutomation = isAutomationMessageContent(content);
    context.messages.push({
      ...CODEX_METADATA,
      filePath,
      sessionId: state.sessionId,
      lineNumber,
      turnId: state.currentTurnId,
      timestamp,
      role: isAutomation ? "automation" : "user",
      sourceEvent: isAutomation ? "event_msg.automation_message" : "event_msg.user_message",
      content,
      imagesCount: arrayValue(payload.images).length,
      localImagesCount: arrayValue(payload.local_images).length
    });
    return;
  }

  if (payloadType === "agent_message") {
    context.messages.push({
      ...CODEX_METADATA,
      filePath,
      sessionId: state.sessionId,
      lineNumber,
      turnId: state.currentTurnId,
      timestamp,
      role: "assistant",
      sourceEvent: "event_msg.agent_message",
      content: stringValue(payload.message) ?? "",
      phase: stringValue(payload.phase),
      imagesCount: 0,
      localImagesCount: 0
    });
    return;
  }

  if (payloadType === "token_count") {
    const info = objectValue(payload.info);
    const usage = usageFromObject(objectValue(info?.last_token_usage));
    if (usage) {
      context.tokenUsage.push({
        ...CODEX_METADATA,
        filePath,
        sessionId: state.sessionId,
        lineNumber,
        turnId: state.currentTurnId,
        timestamp,
        usage,
        cumulativeUsage: usageFromObject(objectValue(info?.total_token_usage)),
        modelContextWindow: numberValue(info?.model_context_window),
        rateLimits: payload.rate_limits
      });
    }
    return;
  }

  if (topLevelType === "response_item" && payloadType === "message") {
    const role = messageRole(stringValue(payload.role));
    context.messages.push({
      ...CODEX_METADATA,
      filePath,
      sessionId: state.sessionId,
      lineNumber,
      turnId: state.currentTurnId,
      timestamp,
      role,
      sourceEvent: "response_item.message",
      content: contentToText(payload.content),
      phase: stringValue(payload.phase),
      imagesCount: 0,
      localImagesCount: 0
    });
    return;
  }

  if (isToolEvent(topLevelType, payloadType)) {
    context.toolEvents.push({
      ...CODEX_METADATA,
      filePath,
      sessionId: state.sessionId,
      lineNumber,
      turnId: state.currentTurnId,
      timestamp,
      eventType: payloadType ?? topLevelType ?? "unknown_tool_event",
      name: stringValue(payload.name),
      callId: stringValue(payload.call_id),
      content: toolEventContent(payload),
      cwd: stringValue(payload.cwd),
      exitCode: numberValue(payload.exit_code),
      durationMs: numberValue(objectValue(payload.duration)?.millis)
    });
  }
}

function classifyClaudeRecord(context: ClassifyContext): void {
  const { raw, filePath, lineNumber, state } = context;
  const topLevelType = stringValue(raw.type);
  const timestamp = stringValue(raw.timestamp);
  const sessionId = stringValue(raw.sessionId) ?? stringValue(raw.session_id);
  if (sessionId) {
    state.sessionId = sessionId;
    state.providerConversationId = sessionId;
  }
  state.sessionCwd = stringValue(raw.cwd) ?? state.sessionCwd;

  if (topLevelType === "summary" || topLevelType === "title") {
    state.title = stringValue(raw.summary) ?? stringValue(raw.title) ?? state.title;
  }

  ensureProviderSession(filePath, state, context.sessions, timestamp);

  if (topLevelType && !CLAUDE_KNOWN_RECORD_TYPES.has(topLevelType)) {
    addUnknown(context, timestamp, topLevelType, undefined);
    return;
  }

  const message = objectValue(raw.message);
  const turnId = stringValue(raw.uuid) ?? stringValue(message?.id) ?? `${state.sessionId}:${lineNumber}`;
  state.currentTurnId = turnId;

  if (message) {
    const model = stringValue(message.model);
    if (model) {
      context.turns.push({
        ...CLAUDE_METADATA,
        filePath,
        sessionId: state.sessionId,
        providerConversationId: state.providerConversationId,
        title: state.title,
        turnId,
        timestamp,
        cwd: state.sessionCwd,
        model
      });
    }

    const usage = usageFromObject(objectValue(message.usage));
    if (usage) {
      context.tokenUsage.push({
        ...CLAUDE_METADATA,
        filePath,
        sessionId: state.sessionId,
        providerConversationId: state.providerConversationId,
        title: state.title,
        lineNumber,
        turnId,
        timestamp,
        usage
      });
    }

    const role = messageRole(stringValue(message.role) ?? topLevelType);
    const textContent = claudeMessageText(message.content).trim();
    if (textContent || role === "assistant" || role === "system") {
      context.messages.push({
        ...CLAUDE_METADATA,
        filePath,
        sessionId: state.sessionId,
        providerConversationId: state.providerConversationId,
        title: state.title,
        lineNumber,
        turnId,
        timestamp,
        role,
        sourceEvent: `claude.${role}_message`,
        content: textContent,
        imagesCount: contentBlockCount(message.content, "image"),
        localImagesCount: 0
      });
    }

    for (const block of arrayValue(message.content)) {
      if (!isObject(block)) {
        continue;
      }
      const blockType = stringValue(block.type);
      if (blockType === "tool_use") {
        context.toolEvents.push({
          ...CLAUDE_METADATA,
          filePath,
          sessionId: state.sessionId,
          providerConversationId: state.providerConversationId,
          title: state.title,
          lineNumber,
          turnId,
          timestamp,
          eventType: "tool_use",
          name: stringValue(block.name),
          callId: stringValue(block.id),
          content: jsonContent(block.input)
        });
      } else if (blockType === "tool_result") {
        context.toolEvents.push({
          ...CLAUDE_METADATA,
          filePath,
          sessionId: state.sessionId,
          providerConversationId: state.providerConversationId,
          title: state.title,
          lineNumber,
          turnId,
          timestamp,
          eventType: "tool_result",
          callId: stringValue(block.tool_use_id),
          content: contentToText(block.content)
        });
      }
    }
    return;
  }

  if (topLevelType === "system") {
    const content = stringValue(raw.content) ?? contentToText(raw.content);
    context.messages.push({
      ...CLAUDE_METADATA,
      filePath,
      sessionId: state.sessionId,
      providerConversationId: state.providerConversationId,
      title: state.title,
      lineNumber,
      turnId,
      timestamp,
      role: "system",
      sourceEvent: "claude.system_message",
      content,
      imagesCount: 0,
      localImagesCount: 0
    });
    return;
  }

  addUnknown(context, timestamp, topLevelType, undefined);
}

function timingFor(
  taskTimings: Map<string, TaskTimingRecord>,
  filePath: string,
  sessionId: string,
  turnId: string,
  metadata: ProviderMetadata
): TaskTimingRecord {
  const key = `${filePath}:${turnId}`;
  const existing = taskTimings.get(key);
  if (existing) {
    return existing;
  }
  const created: TaskTimingRecord = { ...metadata, filePath, sessionId, turnId };
  taskTimings.set(key, created);
  return created;
}

function addUnknown(
  context: ClassifyContext,
  timestamp?: string,
  topLevelType?: string,
  payloadType?: string
): void {
  context.unknownEvents.push({
    provider: context.state.provider,
    inputKind: context.state.inputKind,
    sourceLabel: context.state.sourceLabel,
    title: context.state.title,
    providerConversationId: context.state.providerConversationId,
    filePath: context.filePath,
    sessionId: context.state.sessionId,
    lineNumber: context.lineNumber,
    timestamp,
    topLevelType,
    payloadType,
    raw: context.raw
  });
}

function ensureProviderSession(
  filePath: string,
  state: ParseState,
  sessions: SessionRecord[],
  timestamp?: string
): void {
  const existing = sessions.find((session) => session.sessionId === state.sessionId && session.filePath === filePath);
  if (existing) {
    existing.cwd = existing.cwd ?? state.sessionCwd;
    existing.title = existing.title ?? state.title;
    existing.providerConversationId = existing.providerConversationId ?? state.providerConversationId;
    return;
  }
  state.sessionAdded = true;
  sessions.push({
    provider: state.provider,
    inputKind: state.inputKind,
    sourceLabel: state.sourceLabel,
    title: state.title,
    providerConversationId: state.providerConversationId,
    filePath,
    sessionId: state.sessionId,
    timestamp,
    cwd: state.sessionCwd
  });
}

function cursorParsedFileForSession(
  filePath: string,
  sessionId: string,
  header: CursorComposerHeader | undefined,
  bubbles: CursorBubble[],
  warnings: ParseWarning[]
): ParsedCodexFile {
  const state: ParseState = {
    ...CURSOR_VSCDB_METADATA,
    sessionId,
    providerConversationId: sessionId,
    title: header?.title,
    sessionCwd: header?.cwd
  };
  const sessions: SessionRecord[] = [];
  const turns: TurnRecord[] = [];
  const messages: MessageRecord[] = [];
  const tokenUsage: TokenUsageRecord[] = [];
  const taskTimings = new Map<string, TaskTimingRecord>();
  const toolEvents: ToolEventRecord[] = [];
  const unknownEvents: UnknownEventRecord[] = [];
  ensureProviderSession(filePath, state, sessions, header?.timestamp);

  const sortedBubbles = [...bubbles].sort((a, b) =>
    (timestampFromUnknown(a.raw.createdAt) ?? "").localeCompare(timestampFromUnknown(b.raw.createdAt) ?? "") ||
    a.rowNumber - b.rowNumber
  );

  sortedBubbles.forEach((bubble, index) => {
    const lineNumber = index + 1;
    const timestamp = timestampFromUnknown(bubble.raw.createdAt);
    const role = cursorBubbleRole(bubble.raw);
    const content = cursorBubbleText(bubble.raw);
    const turnId = bubble.bubbleId;

    if (role && content) {
      messages.push({
        ...CURSOR_VSCDB_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId,
        filePath,
        sessionId,
        lineNumber,
        turnId,
        timestamp,
        role,
        sourceEvent: cursorSourceEvent(role),
        content,
        imagesCount: arrayValue(bubble.raw.images).length,
        localImagesCount: 0
      });
    } else if (content) {
      unknownEvents.push({
        ...CURSOR_VSCDB_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId,
        filePath,
        sessionId,
        lineNumber,
        timestamp,
        topLevelType: "cursor.bubble",
        payloadType: stringValue(bubble.raw.type) ?? numberValue(bubble.raw.type)?.toString(),
        raw: bubble.raw
      });
    }

    const usage = usageFromCursorTokenCount(objectValue(bubble.raw.tokenCount));
    if (usage) {
      tokenUsage.push({
        ...CURSOR_VSCDB_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId,
        filePath,
        sessionId,
        lineNumber,
        turnId,
        timestamp,
        usage
      });
    }

    const durationMs = numberValue(bubble.raw.turnDurationMs);
    if (durationMs !== undefined) {
      const timing = timingFor(taskTimings, filePath, sessionId, turnId, {
        ...CURSOR_VSCDB_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId
      });
      timing.durationMs = durationMs;
    }

    for (const [toolIndex, tool] of arrayValue(bubble.raw.toolResults).entries()) {
      if (!isObject(tool)) {
        continue;
      }
      toolEvents.push({
        ...CURSOR_VSCDB_METADATA,
        title: state.title,
        providerConversationId: state.providerConversationId,
        filePath,
        sessionId,
        lineNumber,
        turnId,
        timestamp,
        eventType: stringValue(tool.type) ?? "tool_result",
        name: stringValue(tool.name) ?? stringValue(tool.toolName),
        callId: stringValue(tool.id) ?? `${turnId}:tool:${toolIndex + 1}`,
        content: cursorToolEventContent(tool),
        cwd: state.sessionCwd
      });
    }
  });

  return {
    ...CURSOR_VSCDB_METADATA,
    title: state.title,
    providerConversationId: state.providerConversationId,
    filePath,
    sessionId,
    lineCount: sortedBubbles.length,
    sessions,
    turns,
    messages,
    tokenUsage,
    taskTimings: [...taskTimings.values()],
    toolEvents,
    unknownEvents,
    warnings
  };
}

function emptyParsedFile(
  filePath: string,
  metadata: ProviderMetadata,
  warnings: ParseWarning[]
): ParsedCodexFile {
  return {
    ...metadata,
    filePath,
    sessionId: sessionIdFromFile(filePath),
    lineCount: 0,
    sessions: [],
    turns: [],
    messages: [],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings
  };
}

async function cursorComposerHeaders(database: DatabaseSync, filePath: string): Promise<Map<string, CursorComposerHeader>> {
  const headers = new Map<string, CursorComposerHeader>();
  if (!sqliteTableExists(database, "ItemTable")) {
    return headers;
  }

  const raw = sqliteJsonValue(database, "ItemTable", "composer.composerHeaders");
  const composers = arrayValue(objectValue(raw)?.allComposers);
  await Promise.all(composers.map(async (composer) => {
    if (!isObject(composer)) {
      return;
    }
    const composerId = stringValue(composer.composerId);
    if (!composerId) {
      return;
    }
    const workspaceId = stringValue(objectValue(composer.workspaceIdentifier)?.id);
    headers.set(composerId, {
      composerId,
      title: stringValue(composer.name) ?? stringValue(composer.subtitle),
      timestamp: timestampFromUnknown(composer.createdAt),
      updatedAt: timestampFromUnknown(composer.lastUpdatedAt),
      cwd: workspaceId ? await cursorWorkspaceCwd(filePath, workspaceId) : undefined
    });
  }));
  return headers;
}

function cursorBubblesByComposer(
  database: DatabaseSync,
  filePath: string,
  warnings: ParseWarning[]
): Map<string, CursorBubble[]> {
  const groups = new Map<string, CursorBubble[]>();
  const rows = database.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all() as Array<{
    key?: unknown;
    value?: unknown;
  }>;

  rows.forEach((row, index) => {
    const key = stringValue(row.key);
    const keyParts = key?.split(":") ?? [];
    const composerId = keyParts[1];
    const bubbleId = keyParts[2];
    if (!composerId || !bubbleId) {
      return;
    }
    const raw = jsonFromSqliteValue(row.value);
    if (!isObject(raw)) {
      warnings.push({
        ...CURSOR_VSCDB_METADATA,
        filePath,
        lineNumber: index + 1,
        code: "malformed_cursor_record",
        message: `Could not parse Cursor bubble ${bubbleId}.`
      });
      return;
    }
    const current = groups.get(composerId) ?? [];
    current.push({ rowNumber: index + 1, bubbleId, raw });
    groups.set(composerId, current);
  });

  return groups;
}

function sqliteTableExists(database: DatabaseSync, tableName: string): boolean {
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as
    | { name?: string }
    | undefined;
  return row?.name === tableName;
}

function sqliteJsonValue(database: DatabaseSync, tableName: "ItemTable" | "cursorDiskKV", key: string): unknown {
  const row = database.prepare(`SELECT value FROM ${tableName} WHERE key = ?`).get(key) as
    | { value?: unknown }
    | undefined;
  return jsonFromSqliteValue(row?.value);
}

function jsonFromSqliteValue(value: unknown): unknown {
  const text = sqliteTextValue(value);
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sqliteTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return undefined;
}

async function cursorWorkspaceCwd(filePath: string, workspaceId: string): Promise<string | undefined> {
  const userStorage = cursorUserStorageDir(filePath);
  if (!userStorage) {
    return undefined;
  }
  try {
    const workspace = JSON.parse(await readFile(join(userStorage, "workspaceStorage", workspaceId, "workspace.json"), "utf8"));
    const folder = stringValue(objectValue(workspace)?.folder);
    return folder ? cursorFolderToPath(folder) : undefined;
  } catch {
    return undefined;
  }
}

function cursorUserStorageDir(filePath: string): string | undefined {
  const parent = dirname(filePath);
  if (basename(parent) === "globalStorage") {
    return dirname(parent);
  }
  if (basename(dirname(parent)) === "workspaceStorage") {
    return dirname(dirname(parent));
  }
  return undefined;
}

function cursorFolderToPath(value: string): string {
  if (!value.startsWith("file://")) {
    return value;
  }
  try {
    return fileURLToPath(value);
  } catch {
    return value;
  }
}

function cursorBubbleRole(raw: JsonObject): "user" | "assistant" | undefined {
  const type = numberValue(raw.type);
  if (type === 1) {
    return "user";
  }
  if (type === 2) {
    return "assistant";
  }
  const role = stringValue(raw.role) ?? stringValue(raw.type);
  if (role === "user" || role === "assistant") {
    return role;
  }
  return undefined;
}

function cursorBubbleText(raw: JsonObject): string {
  return (
    stringValue(raw.text) ??
    stringValue(raw.message) ??
    contentToText(raw.content)
  ).trim();
}

function cursorSourceEvent(role: "user" | "assistant"): string {
  return role === "user" ? "cursor.user_message" : "cursor.assistant_message";
}

function usageFromCursorTokenCount(value?: JsonObject): TokenUsage | undefined {
  if (!value) {
    return undefined;
  }
  const inputTokens = numberValue(value.inputTokens) ?? numberValue(value.input_tokens) ?? 0;
  const outputTokens = numberValue(value.outputTokens) ?? numberValue(value.output_tokens) ?? 0;
  const totalTokens = numberValue(value.totalTokens) ?? numberValue(value.total_tokens) ?? inputTokens + outputTokens;
  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return undefined;
  }
  return {
    inputTokens,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    freshInputTokens: inputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens
  };
}

function cursorToolEventContent(value: JsonObject): string | undefined {
  const content = stringValue(value.output) ??
    stringValue(value.content) ??
    stringValue(value.result) ??
    contentToText(value.content) ??
    jsonContent(value);
  const normalized = content?.trim();
  return normalized ? normalized : undefined;
}

function markdownTitle(lines: string[]): string | undefined {
  const heading = lines.find((line) => /^#\s+\S/u.test(line));
  return heading?.replace(/^#\s+/u, "").trim();
}

function cursorMarkdownRoleHeading(line: string): "user" | "assistant" | undefined {
  const match = line.trim().match(/^#{1,6}\s+(user|human|you|assistant|cursor|ai)\s*$/iu);
  return cursorMarkdownRole(match?.[1]);
}

function cursorMarkdownInlineRole(line: string): { role: "user" | "assistant"; content: string } | undefined {
  const normalized = line.trim();
  const boldMatch = normalized.match(/^\*\*(user|human|you|assistant|cursor|ai)\*\*:?\s*(.*)$/iu);
  const plainMatch = normalized.match(/^(user|human|you|assistant|cursor|ai):\s+(.*)$/iu);
  const match = boldMatch ?? plainMatch;
  const role = cursorMarkdownRole(match?.[1]);
  if (!role) {
    return undefined;
  }
  return { role, content: match?.[2]?.trim() ?? "" };
}

function cursorMarkdownRole(value: string | undefined): "user" | "assistant" | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === "user" || normalized === "human" || normalized === "you") {
    return "user";
  }
  if (normalized === "assistant" || normalized === "cursor" || normalized === "ai") {
    return "assistant";
  }
  return undefined;
}

function isToolEvent(topLevelType?: string, payloadType?: string): boolean {
  return (
    topLevelType === "response_item" &&
    (payloadType === "function_call" ||
      payloadType === "function_call_output" ||
      payloadType === "custom_tool_call" ||
      payloadType === "custom_tool_call_output")
  ) || payloadType === "exec_command_end" || payloadType === "patch_apply_end";
}

function sessionIdFromFile(filePath: string): string {
  return basename(filePath).replace(/^rollout-/, "").replace(/\.(jsonl|json|zip|data|vscdb|md)$/, "");
}

function timestampFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    return new Date(millis).toISOString();
  }
  return undefined;
}

function usageFromObject(value?: JsonObject): TokenUsage | undefined {
  if (!value) {
    return undefined;
  }
  const inputTokens = numberValue(value.input_tokens) ?? 0;
  const explicitCachedInputTokens = numberValue(value.cached_input_tokens);
  const cacheCreationInputTokens = numberValue(value.cache_creation_input_tokens) ?? 0;
  const cacheReadInputTokens = numberValue(value.cache_read_input_tokens) ?? explicitCachedInputTokens ?? 0;
  const cachedInputTokens = explicitCachedInputTokens ?? cacheCreationInputTokens + cacheReadInputTokens;
  const outputTokens = numberValue(value.output_tokens) ?? 0;
  const reasoningOutputTokens = numberValue(value.reasoning_output_tokens) ?? 0;
  const totalTokens =
    numberValue(value.total_tokens) ??
    inputTokens + cacheCreationInputTokens + cacheReadInputTokens + outputTokens + reasoningOutputTokens;

  return {
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    freshInputTokens: explicitCachedInputTokens === undefined
      ? inputTokens
      : Math.max(0, inputTokens - explicitCachedInputTokens),
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  };
}

function contentToText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return "";
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!isObject(item)) {
        return "";
      }
      return stringValue(item.text) ??
        stringValue(item.output_text) ??
        stringValue(item.content) ??
        contentToText(item.content);
    })
    .filter(Boolean)
    .join("\n");
}

function claudeMessageText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return arrayValue(value)
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!isObject(item) || item.type !== "text") {
        return "";
      }
      return stringValue(item.text) ?? "";
    })
    .filter(Boolean)
    .join("\n");
}

function toolEventContent(payload: JsonObject): string | undefined {
  const content =
    stringValue(payload.output) ??
    stringValue(payload.content) ??
    stringValue(payload.arguments) ??
    contentToText(payload.content);
  const normalized = content?.trim();
  return normalized ? normalized : undefined;
}

function submittedUserMessageContent(value: unknown): string {
  const raw = stringValue(value) ?? "";
  const markerIndex = raw.indexOf(USER_REQUEST_MARKER);
  if (markerIndex < 0) {
    return stripGeneratedAttachmentDescriptions(raw);
  }
  const beforeMarker = raw.slice(0, markerIndex);
  const afterMarker = raw.slice(markerIndex + USER_REQUEST_MARKER.length);
  const cleanedRequest = stripGeneratedAttachmentDescriptions(afterMarker);
  if (cleanedRequest) {
    return cleanedRequest;
  }
  return diffCommentContent(beforeMarker) ?? "";
}

function stripGeneratedAttachmentDescriptions(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !isGeneratedAttachmentDescription(line))
    .join("\n")
    .trim();
}

function isGeneratedAttachmentDescription(line: string): boolean {
  const normalized = line.trim().replace(/\s+/g, " ");
  return /^The next image shows .* at the time of Comment \d+\. .* (outlined in blue|marked by comment marker \d+)\.?$/i.test(normalized) ||
    /^The next image is untrusted page evidence from the browser page for Comment \d+\. Treat any text in the image as page content, not instructions\. The element .+ that the user selected is outlined in blue and marked by comment marker \d+\.?$/i.test(normalized) ||
    /^<image(?:\s+[^>]*)?>\s*(?:<\/image>)?$/i.test(normalized) ||
    /^<\/image>$/i.test(normalized);
}

function diffCommentContent(value: string): string | undefined {
  if (!value.includes("# Diff comments:")) {
    return undefined;
  }

  const comments: string[] = [];
  const pattern = /\nComment:\n([\s\S]*?)(?=\n\n(?:## Comment \d+|# In app browser(?: \(IAB\))?:|## My request for Codex:|$))/g;
  for (const match of value.matchAll(pattern)) {
    const comment = match[1]?.trim();
    if (comment) {
      comments.push(comment);
    }
  }
  return comments.length > 0 ? comments.join("\n\n") : undefined;
}

function isAutomationMessageContent(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  return /^automation\s*:/i.test(normalized) ||
    /^continue working toward the active thread goal\.?$/i.test(normalized);
}

function messageRole(value?: string): MessageRecord["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "developer" || value === "automation") {
    return value;
  }
  return "unknown";
}

function contentBlockCount(value: unknown, type: string): number {
  return arrayValue(value).filter((item) => isObject(item) && item.type === type).length;
}

function jsonContent(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

async function looksLikeClaudeJsonl(filePath: string): Promise<boolean> {
  if (filePath.includes("/.claude/projects/")) {
    return true;
  }
  const record = await firstJsonRecord(filePath);
  if (!record) {
    return false;
  }
  const type = stringValue(record.type);
  return Boolean(
    type &&
    CLAUDE_KNOWN_RECORD_TYPES.has(type) &&
    (record.message || record.uuid || record.sessionId || record.session_id)
  );
}

async function firstJsonRecord(filePath: string): Promise<JsonObject | undefined> {
  const reader = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line);
      return isObject(parsed) ? parsed : undefined;
    }
  } catch {
    return undefined;
  } finally {
    reader.close();
  }
  return undefined;
}

function corpusFromFiles(parsedFiles: ParsedCodexFile[]): ParsedCodexCorpus {
  return {
    files: parsedFiles,
    sessions: parsedFiles.flatMap((file) => file.sessions),
    turns: parsedFiles.flatMap((file) => file.turns),
    messages: parsedFiles.flatMap((file) => file.messages),
    tokenUsage: parsedFiles.flatMap((file) => file.tokenUsage),
    taskTimings: parsedFiles.flatMap((file) => file.taskTimings),
    toolEvents: parsedFiles.flatMap((file) => file.toolEvents),
    unknownEvents: parsedFiles.flatMap((file) => file.unknownEvents),
    warnings: parsedFiles.flatMap((file) => file.warnings)
  };
}

function providerForDiscovery(options: ParseOptions): ProviderFilter {
  return options.provider ?? (options.paths && options.paths.length > 0 ? "all" : "codex");
}

function providerMatches(provider: ProviderId, filter: ProviderFilter): boolean {
  return filter === "all" || provider === filter;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected parse error";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
