import Foundation

enum AppConstants {
  static let allProjectsName = "All Projects"
  static let allModelsName = "All Models"
}

enum ExportFormat: String {
  case json
  case csv

  var fileExtension: String { rawValue }
}

enum MessageRoleFilter: String, CaseIterable, Identifiable {
  case all
  case user
  case automation
  case assistant
  case system
  case developer

  var id: String { rawValue }

  var label: String {
    switch self {
    case .all:
      return "All"
    case .user:
      return "User"
    case .automation:
      return "Automation"
    case .assistant:
      return "Assistant"
    case .system:
      return "System"
    case .developer:
      return "Developer"
    }
  }
}

struct LogFilters: Equatable {
  var paths: [String] = []
  var since: String?
  var until: String?
  var refreshToken = 0
}

struct ProjectsResponse: Decodable {
  let projects: [ProjectListItem]
}

struct SummaryResponse: Decodable {
  let summary: ProjectSummary
}

struct MessageSearchResponse: Decodable {
  let search: MessageSearchSummary
}

struct ProjectListItem: Decodable, Identifiable, Hashable {
  let project: String
  let cwdSamples: [String]
  let sessions: Int
  let turns: Int
  let messages: Int
  let totalTokens: Int

  var id: String { project }
}

struct ProjectSummary: Decodable {
  let project: String
  let generatedAt: String
  let totals: SummaryTotals
  let tokens: TokenUsage
  let messagesByDay: [DateBucket]
  let messagesByHour: [DateBucket]
  let tokensByDay: [DateBucket]
  let models: [ModelBucket]
  let sessions: [SessionSummary]
  let repeatedUserMessages: [RepeatedUserMessage]
}

struct SummaryTotals: Decodable {
  let sessions: Int
  let turns: Int
  let userMessages: Int
  let automationMessages: Int
  let assistantMessages: Int
  let uniqueUserMessages: Int
  let toolEvents: Int
  let unknownEvents: Int
  let parseWarnings: Int
}

struct TokenUsage: Decodable, Hashable {
  let inputTokens: Int
  let cachedInputTokens: Int
  let freshInputTokens: Int
  let outputTokens: Int
  let reasoningOutputTokens: Int
  let totalTokens: Int
}

struct DateBucket: Decodable, Hashable {
  let key: String
  let count: Int
  let uniqueCount: Int
  let tokens: TokenUsage
}

struct ModelBucket: Decodable, Hashable {
  let model: String
  let turns: Int
  let tokens: TokenUsage
}

struct SessionSummary: Decodable, Identifiable, Hashable {
  let sessionId: String
  let filePath: String
  let project: String
  let cwd: String?
  let firstSeen: String?
  let lastSeen: String?
  let userMessages: Int
  let automationMessages: Int
  let assistantMessages: Int
  let totalTokens: Int
  let models: [String]

  var id: String { "\(filePath)#\(sessionId)" }
  var shortSessionId: String { String(sessionId.prefix(8)) }
}

struct RepeatedUserMessage: Decodable, Identifiable, Hashable {
  let id: String
  let sample: String
  let category: String?
  let count: Int
  let sessionCount: Int
  let projects: [String]
  let firstSeen: String?
  let lastSeen: String?
  let variants: [RepeatedUserMessageVariant]
}

struct RepeatedUserMessageVariant: Decodable, Hashable {
  let sample: String
  let count: Int
  let firstSeen: String?
  let lastSeen: String?
}

struct MessageSearchSummary: Decodable {
  let query: String
  let project: String
  let generatedAt: String
  let totalMatches: Int
  let limit: Int
  let results: [MessageSearchResult]
}

struct MessageSearchResult: Decodable, Identifiable, Hashable {
  let id: String
  let sessionId: String
  let filePath: String
  let project: String
  let cwd: String?
  let turnId: String?
  let model: String?
  let timestamp: String?
  let role: String
  let sourceEvent: String
  let snippet: String
}

struct SessionDetail: Decodable {
  let file: SessionDetailFile
  let turns: [TurnDetail]
  let messages: [MessageDetail]
  let tokenUsage: [TokenUsageDetail]
  let taskTimings: [TaskTimingDetail]
  let toolEvents: [EventPlaceholder]
  let unknownEvents: [EventPlaceholder]
  let warnings: [ParseWarningDetail]
}

struct SessionDetailFile: Decodable {
  let filePath: String
  let sessionId: String
  let lineCount: Int
}

struct TurnDetail: Decodable, Hashable {
  let turnId: String
  let model: String?
  let effort: String?
  let cwd: String?
  let timestamp: String?
}

struct MessageDetail: Decodable, Hashable {
  let role: String
  let sourceEvent: String
  let content: String
  let turnId: String?
  let timestamp: String?
  let phase: String?
}

struct TokenUsageDetail: Decodable, Hashable {
  let timestamp: String?
  let usage: TokenUsage
  let cumulativeUsage: TokenUsage?
}

struct TaskTimingDetail: Decodable, Hashable {
  let turnId: String
  let durationMs: Double?
  let timeToFirstTokenMs: Double?
}

struct ParseWarningDetail: Decodable, Hashable {
  let lineNumber: Int
  let code: String
  let message: String
}

struct EventPlaceholder: Decodable, Hashable {}
