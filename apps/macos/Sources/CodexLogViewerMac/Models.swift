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
      return "User Sent"
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

enum ProviderFilter: String, CaseIterable, Identifiable {
  case all
  case codex
  case claude

  var id: String { rawValue }

  var label: String {
    switch self {
    case .all:
      return "All"
    case .codex:
      return "Codex"
    case .claude:
      return "Claude"
    }
  }
}

enum AppSection: String, CaseIterable, Identifiable {
  case browse
  case overview
  case search
  case audit

  var id: String { rawValue }

  var label: String {
    switch self {
    case .browse:
      return "Browse"
    case .overview:
      return "Overview"
    case .search:
      return "Search"
    case .audit:
      return "Audit"
    }
  }
}

enum DateRangeMode: String, CaseIterable, Identifiable {
  case all
  case day
  case week
  case month
  case year
  case custom

  var id: String { rawValue }

  var label: String {
    switch self {
    case .all:
      return "All Time"
    case .day:
      return "Day"
    case .week:
      return "Week"
    case .month:
      return "Month"
    case .year:
      return "Year"
    case .custom:
      return "Custom"
    }
  }

  var anchorLabel: String {
    switch self {
    case .day:
      return "Day"
    case .week:
      return "Week Of"
    case .month:
      return "Month"
    case .year:
      return "Year"
    case .all, .custom:
      return "Date"
    }
  }
}

enum ProjectSortOption: String, CaseIterable, Identifiable {
  case mostUserMessages
  case fewestUserMessages
  case latestSession
  case projectName

  var id: String { rawValue }

  var label: String {
    switch self {
    case .mostUserMessages:
      return "Most User Messages"
    case .fewestUserMessages:
      return "Fewest User Messages"
    case .latestSession:
      return "Latest Session"
    case .projectName:
      return "Project Name"
    }
  }

  var shortLabel: String {
    switch self {
    case .mostUserMessages:
      return "Messages"
    case .fewestUserMessages:
      return "Fewest"
    case .latestSession:
      return "Latest"
    case .projectName:
      return "Name"
    }
  }
}

enum EvalReviewStateFilter: String, CaseIterable, Identifiable {
  case all
  case unreviewed
  case correct
  case incorrect

  var id: String { rawValue }

  var label: String {
    switch self {
    case .all:
      return "All"
    case .unreviewed:
      return "Unreviewed"
    case .correct:
      return "Correct"
    case .incorrect:
      return "Incorrect"
    }
  }
}

struct PromptIntentCategoryOption: Identifiable, Hashable {
  let key: String
  let label: String

  var id: String { key }
}

struct LogFilters: Equatable {
  var paths: [String] = []
  var provider: ProviderFilter = .all
  var since: String?
  var until: String?
  var refreshToken = 0
  var rebuildCache = false
}

struct ProjectsResponse: Decodable {
  let projects: [ProjectListItem]
  let cacheStatus: String?
  let reusedFiles: Int?
  let parsedFiles: Int?
  let removedFiles: Int?
  let totalFiles: Int?
  let updatedAt: String?

  var cacheMetadata: CacheMetadata? {
    CacheMetadata(
      cacheStatus: cacheStatus,
      reusedFiles: reusedFiles,
      parsedFiles: parsedFiles,
      removedFiles: removedFiles,
      totalFiles: totalFiles,
      updatedAt: updatedAt
    )
  }
}

struct SummaryResponse: Decodable {
  let summary: ProjectSummary
  let cacheStatus: String?
  let reusedFiles: Int?
  let parsedFiles: Int?
  let removedFiles: Int?
  let totalFiles: Int?
  let updatedAt: String?

  var cacheMetadata: CacheMetadata? {
    CacheMetadata(
      cacheStatus: cacheStatus,
      reusedFiles: reusedFiles,
      parsedFiles: parsedFiles,
      removedFiles: removedFiles,
      totalFiles: totalFiles,
      updatedAt: updatedAt
    )
  }
}

struct MessageSearchResponse: Decodable {
  let search: MessageSearchSummary
  let cacheStatus: String?
  let reusedFiles: Int?
  let parsedFiles: Int?
  let removedFiles: Int?
  let totalFiles: Int?
  let updatedAt: String?

  var cacheMetadata: CacheMetadata? {
    CacheMetadata(
      cacheStatus: cacheStatus,
      reusedFiles: reusedFiles,
      parsedFiles: parsedFiles,
      removedFiles: removedFiles,
      totalFiles: totalFiles,
      updatedAt: updatedAt
    )
  }
}

struct EvalsResponse: Decodable {
  let evals: PromptIntentEvalMessageSummary
  let cacheStatus: String?
  let reusedFiles: Int?
  let parsedFiles: Int?
  let removedFiles: Int?
  let totalFiles: Int?
  let updatedAt: String?

  var cacheMetadata: CacheMetadata? {
    CacheMetadata(
      cacheStatus: cacheStatus,
      reusedFiles: reusedFiles,
      parsedFiles: parsedFiles,
      removedFiles: removedFiles,
      totalFiles: totalFiles,
      updatedAt: updatedAt
    )
  }
}

struct EvalReviewResponse: Decodable {
  let review: PromptIntentEvalReview
}

struct AuditPreviewResponse: Decodable {
  let audit: AuditPreview
}

struct AuditWriteResponse: Decodable {
  let audit: AuditWriteResult
}

struct AuditPreview: Decodable, Equatable {
  let targetPath: String
  let generatedMarkdown: String
  let existingMarkdown: String?
  let mergedMarkdown: String
  let appendedSections: Int
  let skippedSections: Int
  let existingSections: Int
  let generatedSections: Int
}

struct AuditWriteResult: Decodable, Equatable {
  let targetPath: String
  let bytesWritten: Int
}

struct CacheMetadata: Decodable, Equatable {
  let cacheStatus: String
  let reusedFiles: Int
  let parsedFiles: Int
  let removedFiles: Int
  let totalFiles: Int
  let updatedAt: String

  init(
    cacheStatus: String,
    reusedFiles: Int,
    parsedFiles: Int,
    removedFiles: Int,
    totalFiles: Int,
    updatedAt: String
  ) {
    self.cacheStatus = cacheStatus
    self.reusedFiles = reusedFiles
    self.parsedFiles = parsedFiles
    self.removedFiles = removedFiles
    self.totalFiles = totalFiles
    self.updatedAt = updatedAt
  }

  init?(
    cacheStatus: String?,
    reusedFiles: Int?,
    parsedFiles: Int?,
    removedFiles: Int?,
    totalFiles: Int?,
    updatedAt: String?
  ) {
    guard let cacheStatus,
      let reusedFiles,
      let parsedFiles,
      let removedFiles,
      let totalFiles,
      let updatedAt
    else {
      return nil
    }
    self.cacheStatus = cacheStatus
    self.reusedFiles = reusedFiles
    self.parsedFiles = parsedFiles
    self.removedFiles = removedFiles
    self.totalFiles = totalFiles
    self.updatedAt = updatedAt
  }
}

struct ProjectListItem: Decodable, Identifiable, Hashable {
  let project: String
  let providers: [String]
  let cwdSamples: [String]
  let sessions: Int
  let turns: Int
  let messages: Int
  let totalTokens: Int
  let firstSeen: String?
  let lastSeen: String?

  var id: String { project }
}

struct ProjectSummary: Decodable {
  let project: String
  let generatedAt: String
  let activity: SummaryActivity?
  let totals: SummaryTotals
  let tokens: TokenUsage
  let messagesByDay: [DateBucket]
  let messagesByHour: [DateBucket]
  let tokensByDay: [DateBucket]
  let models: [ModelBucket]
  let providers: [ProviderBucket]
  let sessions: [SessionSummary]
  let promptIntents: PromptIntentSummary
  let repeatedUserMessages: [RepeatedUserMessage]
}

struct SummaryActivity: Decodable, Hashable {
  let firstSeen: String?
  let lastSeen: String?
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
  let cacheCreationInputTokens: Int?
  let cacheReadInputTokens: Int?
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

struct ProviderBucket: Decodable, Hashable {
  let provider: String
  let sessions: Int
  let messages: Int
  let totalTokens: Int
}

struct SessionSummary: Decodable, Identifiable, Hashable {
  let provider: String
  let sourceLabel: String?
  let title: String?
  let providerConversationId: String?
  let sessionId: String
  let filePath: String
  let dateKey: String
  let project: String
  let cwd: String?
  let firstSeen: String?
  let lastSeen: String?
  let userMessages: Int
  let automationMessages: Int
  let assistantMessages: Int
  let totalTokens: Int
  let models: [String]

  var id: String { "\(filePath)#\(sessionId)#\(dateKey)" }
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

struct PromptIntentSummary: Decodable, Hashable {
  let totalMessages: Int
  let classifiedMessages: Int
  let unclassifiedMessages: Int
  let buckets: [PromptIntentBucket]
}

struct PromptIntentBucket: Decodable, Identifiable, Hashable {
  let key: String
  let label: String
  let count: Int
  let percentage: Double
  let sessionCount: Int
  let projects: [String]
  let examples: [String]
  let firstSeen: String?
  let lastSeen: String?

  var id: String { key }
}

struct MessageSearchSummary: Decodable {
  let query: String
  let project: String
  let generatedAt: String
  let totalMatches: Int
  let limit: Int
  let offset: Int
  let results: [MessageSearchResult]
}

struct MessageSearchResult: Decodable, Identifiable, Hashable {
  let id: String
  let provider: String
  let sourceLabel: String?
  let title: String?
  let providerConversationId: String?
  let sessionId: String
  let filePath: String
  let dateKey: String?
  let project: String
  let cwd: String?
  let lineNumber: Int?
  let turnId: String?
  let model: String?
  let timestamp: String?
  let role: String
  let sourceEvent: String
  let category: String?
  let promptIntentKey: String?
  let promptIntent: String?
  let snippet: String
  let content: String
}

struct PromptIntentEvalMessageSummary: Decodable {
  let query: String
  let project: String
  let generatedAt: String
  let totalMatches: Int
  let limit: Int
  let offset: Int
  let summary: PromptIntentEvalSummary
  let results: [PromptIntentEvalMessage]
}

struct PromptIntentEvalSummary: Decodable, Hashable {
  let totalMessages: Int
  let reviewedMessages: Int
  let correctMessages: Int
  let incorrectMessages: Int
  let reviewedAccuracy: Double?
  let categories: [PromptIntentEvalCategorySummary]
  let confusions: [PromptIntentEvalConfusion]
}

struct PromptIntentEvalCategorySummary: Decodable, Identifiable, Hashable {
  let key: String
  let label: String
  let total: Int
  let reviewed: Int
  let correct: Int
  let incorrect: Int
  let unreviewed: Int
  let precision: Double?
  let recall: Double?

  var id: String { key }
}

struct PromptIntentEvalConfusion: Decodable, Identifiable, Hashable {
  let actualKey: String
  let actualLabel: String
  let expectedKey: String
  let expectedLabel: String
  let count: Int

  var id: String { "\(actualKey)#\(expectedKey)" }
}

struct PromptIntentEvalReview: Decodable, Hashable {
  let evalId: String
  let actualKey: String
  let expectedKey: String
  let isCorrect: Bool
  let reviewedAt: String
  let note: String?
}

struct PromptIntentEvalMessage: Decodable, Identifiable, Hashable {
  let evalId: String
  let sessionId: String
  let filePath: String
  let dateKey: String
  let project: String
  let cwd: String?
  let lineNumber: Int?
  let turnId: String?
  let timestamp: String?
  let promptIntentKey: String
  let promptIntent: String
  let ruleKey: String
  let ruleLabel: String
  let confidence: String
  let signals: [String]
  let snippet: String
  let content: String
  let review: PromptIntentEvalReview?

  var id: String { evalId }
}

struct SessionDetail: Decodable {
  let file: SessionDetailFile
  let turns: [TurnDetail]
  let messages: [MessageDetail]
  let tokenUsage: [TokenUsageDetail]
  let taskTimings: [TaskTimingDetail]
  let toolEvents: [ToolEventDetail]
  let unknownEvents: [UnknownEventDetail]
  let warnings: [ParseWarningDetail]
}

struct SessionDetailFile: Decodable {
  let provider: String?
  let sourceLabel: String?
  let title: String?
  let providerConversationId: String?
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
  let provider: String?
  let sourceLabel: String?
  let title: String?
  let providerConversationId: String?
  let role: String
  let sourceEvent: String
  let category: String?
  let promptIntentKey: String?
  let promptIntent: String?
  let content: String
  let lineNumber: Int?
  let turnId: String?
  let timestamp: String?
  let phase: String?
}

struct TokenUsageDetail: Decodable, Hashable {
  let lineNumber: Int?
  let turnId: String?
  let timestamp: String?
  let usage: TokenUsage
  let cumulativeUsage: TokenUsage?
}

struct TaskTimingDetail: Decodable, Hashable {
  let turnId: String
  let durationMs: Double?
  let timeToFirstTokenMs: Double?
}

struct ToolEventDetail: Decodable, Hashable {
  let lineNumber: Int?
  let turnId: String?
  let timestamp: String?
  let eventType: String
  let name: String?
  let callId: String?
  let content: String?
  let cwd: String?
  let exitCode: Int?
  let durationMs: Double?
}

struct UnknownEventDetail: Decodable, Hashable {
  let lineNumber: Int?
  let timestamp: String?
  let topLevelType: String?
  let payloadType: String?
}

struct ParseWarningDetail: Decodable, Hashable {
  let lineNumber: Int
  let code: String
  let message: String
}
