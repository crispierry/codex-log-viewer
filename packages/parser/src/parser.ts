import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import { discoverCodexLogFiles } from "./discover.js";
import type {
  JsonObject,
  MessageRecord,
  ParsedCodexCorpus,
  ParsedCodexFile,
  ParseOptions,
  ParseWarning,
  SessionRecord,
  TaskTimingRecord,
  TokenUsage,
  TokenUsageRecord,
  ToolEventRecord,
  TurnRecord,
  UnknownEventRecord
} from "./types.js";

interface ParseState {
  sessionId: string;
  currentTurnId?: string;
  sessionCwd?: string;
}

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

export async function parseCodexCorpus(options: ParseOptions = {}): Promise<ParsedCodexCorpus> {
  const files = await discoverCodexLogFiles(options.paths);
  const parsedFiles = await Promise.all(files.map((file) => parseCodexLogFile(file)));

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

export async function parseCodexLogFile(filePath: string): Promise<ParsedCodexFile> {
  const state: ParseState = { sessionId: sessionIdFromFile(filePath) };
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

    const raw = parseLine(line, filePath, lineCount, warnings);
    if (!raw) {
      continue;
    }

    classifyEvent({
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

function parseLine(
  line: string,
  filePath: string,
  lineNumber: number,
  warnings: ParseWarning[]
): JsonObject | undefined {
  try {
    const parsed = JSON.parse(line);
    return isObject(parsed) ? parsed : undefined;
  } catch (error) {
    warnings.push({
      filePath,
      lineNumber,
      code: "malformed_json",
      message: error instanceof Error ? error.message : "Malformed JSON"
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

function classifyEvent(context: ClassifyContext): void {
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
      const current = timingFor(context.taskTimings, filePath, state.sessionId, turnId);
      current.startedAt = numberValue(payload.started_at);
    }
    return;
  }

  if (payloadType === "task_complete") {
    const turnId = stringValue(payload.turn_id) ?? state.currentTurnId;
    if (turnId) {
      const current = timingFor(context.taskTimings, filePath, state.sessionId, turnId);
      current.completedAt = numberValue(payload.completed_at);
      current.durationMs = numberValue(payload.duration_ms);
      current.timeToFirstTokenMs = numberValue(payload.time_to_first_token_ms);
      current.lastAgentMessage = stringValue(payload.last_agent_message);
    }
    return;
  }

  if (payloadType === "user_message") {
    context.messages.push({
      filePath,
      sessionId: state.sessionId,
      turnId: state.currentTurnId,
      timestamp,
      role: "user",
      sourceEvent: "event_msg.user_message",
      content: stringValue(payload.message) ?? "",
      imagesCount: arrayValue(payload.images).length,
      localImagesCount: arrayValue(payload.local_images).length
    });
    return;
  }

  if (payloadType === "agent_message") {
    context.messages.push({
      filePath,
      sessionId: state.sessionId,
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
        filePath,
        sessionId: state.sessionId,
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
      filePath,
      sessionId: state.sessionId,
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
      filePath,
      sessionId: state.sessionId,
      turnId: state.currentTurnId,
      timestamp,
      eventType: payloadType ?? topLevelType ?? "unknown_tool_event",
      name: stringValue(payload.name),
      callId: stringValue(payload.call_id),
      cwd: stringValue(payload.cwd),
      exitCode: numberValue(payload.exit_code),
      durationMs: numberValue(objectValue(payload.duration)?.millis)
    });
  }
}

function timingFor(
  taskTimings: Map<string, TaskTimingRecord>,
  filePath: string,
  sessionId: string,
  turnId: string
): TaskTimingRecord {
  const key = `${filePath}:${turnId}`;
  const existing = taskTimings.get(key);
  if (existing) {
    return existing;
  }
  const created: TaskTimingRecord = { filePath, sessionId, turnId };
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
    filePath: context.filePath,
    sessionId: context.state.sessionId,
    lineNumber: context.lineNumber,
    timestamp,
    topLevelType,
    payloadType,
    raw: context.raw
  });
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
  return basename(filePath).replace(/^rollout-/, "").replace(/\.jsonl$/, "");
}

function usageFromObject(value?: JsonObject): TokenUsage | undefined {
  if (!value) {
    return undefined;
  }
  const inputTokens = numberValue(value.input_tokens) ?? 0;
  const cachedInputTokens = numberValue(value.cached_input_tokens) ?? 0;
  const outputTokens = numberValue(value.output_tokens) ?? 0;
  const reasoningOutputTokens = numberValue(value.reasoning_output_tokens) ?? 0;
  const totalTokens =
    numberValue(value.total_tokens) ??
    inputTokens + outputTokens;

  return {
    inputTokens,
    cachedInputTokens,
    freshInputTokens: Math.max(0, inputTokens - cachedInputTokens),
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
      if (!isObject(item)) {
        return "";
      }
      return stringValue(item.text) ?? stringValue(item.output_text) ?? "";
    })
    .filter(Boolean)
    .join("\n");
}

function messageRole(value?: string): MessageRecord["role"] {
  if (value === "user" || value === "assistant" || value === "system" || value === "developer") {
    return value;
  }
  return "unknown";
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

