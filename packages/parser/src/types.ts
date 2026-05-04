export type JsonObject = Record<string, unknown>;

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  freshInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface SessionRecord {
  filePath: string;
  sessionId: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  source?: string;
  modelProvider?: string;
}

export interface TurnRecord {
  filePath: string;
  sessionId: string;
  turnId: string;
  timestamp?: string;
  cwd?: string;
  currentDate?: string;
  timezone?: string;
  model?: string;
  effort?: string;
  collaborationMode?: string;
}

export type MessageRole = "user" | "assistant" | "system" | "developer" | "unknown";

export interface MessageRecord {
  filePath: string;
  sessionId: string;
  turnId?: string;
  timestamp?: string;
  role: MessageRole;
  sourceEvent: string;
  content: string;
  phase?: string;
  imagesCount: number;
  localImagesCount: number;
}

export interface TokenUsageRecord {
  filePath: string;
  sessionId: string;
  turnId?: string;
  timestamp?: string;
  usage: TokenUsage;
  cumulativeUsage?: TokenUsage;
  modelContextWindow?: number;
  rateLimits?: unknown;
}

export interface TaskTimingRecord {
  filePath: string;
  sessionId: string;
  turnId: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  lastAgentMessage?: string;
}

export interface ToolEventRecord {
  filePath: string;
  sessionId: string;
  turnId?: string;
  timestamp?: string;
  eventType: string;
  name?: string;
  callId?: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface UnknownEventRecord {
  filePath: string;
  sessionId: string;
  lineNumber: number;
  timestamp?: string;
  topLevelType?: string;
  payloadType?: string;
  raw: JsonObject;
}

export interface ParseWarning {
  filePath: string;
  lineNumber: number;
  code: string;
  message: string;
}

export interface ParsedCodexFile {
  filePath: string;
  sessionId: string;
  lineCount: number;
  sessions: SessionRecord[];
  turns: TurnRecord[];
  messages: MessageRecord[];
  tokenUsage: TokenUsageRecord[];
  taskTimings: TaskTimingRecord[];
  toolEvents: ToolEventRecord[];
  unknownEvents: UnknownEventRecord[];
  warnings: ParseWarning[];
}

export interface ParsedCodexCorpus {
  files: ParsedCodexFile[];
  sessions: SessionRecord[];
  turns: TurnRecord[];
  messages: MessageRecord[];
  tokenUsage: TokenUsageRecord[];
  taskTimings: TaskTimingRecord[];
  toolEvents: ToolEventRecord[];
  unknownEvents: UnknownEventRecord[];
  warnings: ParseWarning[];
}

export interface ParseOptions {
  paths?: string[];
  homeDir?: string;
}

