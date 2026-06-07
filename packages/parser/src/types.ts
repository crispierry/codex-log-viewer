export type JsonObject = Record<string, unknown>;

export type ProviderId = "codex" | "claude" | "cursor" | (string & {});
export type ProviderFilter = "all" | ProviderId;
export type InputKind =
  | "codex-jsonl"
  | "claude-jsonl"
  | "cursor-vscdb"
  | "cursor-markdown"
  | (string & {});

export interface ProviderMetadata {
  provider: ProviderId;
  inputKind?: InputKind;
  sourceLabel?: string;
  title?: string;
  providerConversationId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  freshInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface SessionRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  timestamp?: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  source?: string;
  modelProvider?: string;
}

export interface TurnRecord extends ProviderMetadata {
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

export type MessageRole = "user" | "assistant" | "system" | "developer" | "automation" | "unknown";

export interface MessageRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  lineNumber?: number;
  turnId?: string;
  timestamp?: string;
  role: MessageRole;
  sourceEvent: string;
  content: string;
  phase?: string;
  imagesCount: number;
  localImagesCount: number;
}

export interface TokenUsageRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  lineNumber?: number;
  turnId?: string;
  timestamp?: string;
  usage: TokenUsage;
  cumulativeUsage?: TokenUsage;
  modelContextWindow?: number;
  rateLimits?: unknown;
}

export interface TaskTimingRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  turnId: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  timeToFirstTokenMs?: number;
  lastAgentMessage?: string;
}

export interface ToolEventRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  lineNumber?: number;
  turnId?: string;
  timestamp?: string;
  eventType: string;
  name?: string;
  callId?: string;
  content?: string;
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface UnknownEventRecord extends ProviderMetadata {
  filePath: string;
  sessionId: string;
  lineNumber: number;
  timestamp?: string;
  topLevelType?: string;
  payloadType?: string;
  rawTruncated?: boolean;
  raw: JsonObject;
}

export interface ParseWarning extends ProviderMetadata {
  filePath: string;
  lineNumber: number;
  code: string;
  message: string;
}

export interface ParsedCodexFile extends ProviderMetadata {
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

export type ParsedLogFile = ParsedCodexFile;
export type ParsedLogCorpus = ParsedCodexCorpus;

export type ParseCacheStatus = "ready" | "checking" | "updated" | "rebuilt";

export interface ParseCacheMetadata {
  cacheStatus: ParseCacheStatus;
  reusedFiles: number;
  parsedFiles: number;
  removedFiles: number;
  totalFiles: number;
  updatedAt: string;
}

export interface CachedParsedCodexCorpus {
  corpus: ParsedCodexCorpus;
  cache: ParseCacheMetadata;
}

export type CachedParsedLogCorpus = CachedParsedCodexCorpus;

export interface ParseOptions {
  paths?: string[];
  provider?: ProviderFilter;
  homeDir?: string;
  cacheDir?: string;
  refreshCache?: boolean;
  rebuildCache?: boolean;
}
