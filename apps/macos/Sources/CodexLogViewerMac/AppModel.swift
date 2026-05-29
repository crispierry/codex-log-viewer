import AppKit
import Darwin
import Foundation

struct LogLoadingNotice: Equatable {
  let title: String
  let message: String
}

@MainActor
final class AppModel: ObservableObject {
  enum Status: Equatable {
    case starting
    case ready
    case loading
    case failed(String)

    var label: String {
      switch self {
      case .starting:
        return "Starting"
      case .ready:
        return "Ready"
      case .loading:
        return "Loading"
      case .failed:
        return "Needs Attention"
      }
    }
  }

  @Published var status: Status = .starting
  @Published var selectedSection: AppSection = .browse
  @Published var selectedProject = AppConstants.allProjectsName
  @Published var projects: [ProjectListItem] = []
  @Published var summary: ProjectSummary?
  @Published var selectedSessionID: SessionSummary.ID?
  @Published var selectedSessionDetail: SessionDetail?
  @Published var selectedUserMessageIndex: Int?
  @Published var isDetailLoading = false
  @Published var showSessionBrowser = false
  @Published var browseMessagesSummary: MessageSearchSummary?
  @Published var selectedBrowseMessageID: MessageSearchResult.ID?
  @Published var isBrowseMessagesLoading = false
  @Published var messageQuery = ""
  @Published var messageRoleFilter: MessageRoleFilter = .user
  @Published var messageModelFilter = AppConstants.allModelsName
  @Published var messageSessionFilter: String?
  @Published private var messageSessionFilePathFilter: String?
  @Published private var messageSessionDateKeyFilter: String?
  @Published var searchSummary: MessageSearchSummary?
  @Published var selectedSearchResultID: MessageSearchResult.ID?
  @Published var pathDraft = ""
  @Published var sourcePaths: [String] = []
  @Published var recentSourcePaths: [String] = []
  @Published var hasSinceFilter = false
  @Published var hasUntilFilter = false
  @Published var sinceDate = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
  @Published var untilDate = Date()
  @Published var dateRangeMode: DateRangeMode = .all
  @Published var dateAnchorDate = Date()
  @Published var projectSortOption: ProjectSortOption = .mostUserMessages
  @Published var hiddenOperationalMessageCategories: Set<String> = []
  @Published var hiddenRepeatedPromptCategories: Set<String> = []
  @Published var messageSearchFocusRequest = 0
  @Published var cacheMetadata: CacheMetadata?
  @Published private(set) var logLoadingNotice: LogLoadingNotice?
  @Published private(set) var isBackgroundSyncing = false
  @Published var auditRepoPathDraft = ""
  @Published var auditIncludeResponses = true
  @Published var auditPreview: AuditPreview?
  @Published var auditReviewMarkdown = ""
  @Published var auditStatusMessage: String?
  @Published var isAuditLoading = false
  @Published var evalsSummary: PromptIntentEvalMessageSummary?
  @Published var selectedEvalMessageID: PromptIntentEvalMessage.ID?
  @Published var evalCategoryKeyFilter: String?
  @Published var evalReviewStateFilter: EvalReviewStateFilter = .all
  @Published var evalQuery = ""
  @Published var evalReviewNote = ""
  @Published var isEvalsLoading = false
  @Published var evalsStatusMessage: String?

  private var exportDirectoryPath = ""
  private var api: LogEngineAPI?
  private var hasStarted = false
  private var refreshToken = 0
  private var reloadTask: Task<Void, Never>?
  private var detailTask: Task<Void, Never>?
  private var quietDetailRefreshTask: Task<Void, Never>?
  private var browseMessagesTask: Task<Void, Never>?
  private var searchTask: Task<Void, Never>?
  private var auditTask: Task<Void, Never>?
  private var evalsTask: Task<Void, Never>?
  private var evalReviewTask: Task<Void, Never>?
  private var backgroundSyncTask: Task<Void, Never>?
  private var reloadRequestID = 0
  private var detailRequestID = 0
  private var quietDetailRefreshRequestID = 0
  private var browseMessagesRequestID = 0
  private var searchRequestID = 0
  private var auditRequestID = 0
  private var evalsRequestID = 0
  private var evalReviewRequestID = 0
  private var pendingSearchResultTarget: SearchResultSelectionTarget?
  private var pendingSearchConversationResult: MessageSearchResult?
  private var isLogRefreshInFlight = false
  private let isEphemeralSettingsRun = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_EPHEMERAL_SETTINGS"] == "1" ||
    ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_TEST"] == "1"
  private var hasScheduledUITestQuit = false
  private static let backgroundSyncInterval: Duration = .seconds(60)

  private enum RefreshMode {
    case foreground
    case background
  }

  init() {
    loadSettings()
  }

  deinit {
    reloadTask?.cancel()
    detailTask?.cancel()
    quietDetailRefreshTask?.cancel()
    browseMessagesTask?.cancel()
    searchTask?.cancel()
    auditTask?.cancel()
    evalsTask?.cancel()
    evalReviewTask?.cancel()
    backgroundSyncTask?.cancel()
  }

  var browseMessages: [MessageSearchResult] {
    visibleBrowseMessages(in: browseMessagesSummary?.results ?? [])
  }

  var areBrowseMessagesHiddenByOperationalFilters: Bool {
    guard let summary = browseMessagesSummary,
      summary.totalMatches > 0,
      !hiddenOperationalMessageCategories.isEmpty,
      visibleBrowseMessages(in: summary.results).isEmpty
    else {
      return false
    }

    return summary.results.contains { result in
      guard let category = result.category else { return false }
      return hiddenOperationalMessageCategories.contains(category)
    }
  }

  var searchResults: [MessageSearchResult] {
    visibleSearchResults(in: searchSummary?.results ?? [])
  }

  var evalMessages: [PromptIntentEvalMessage] {
    evalsSummary?.results ?? []
  }

  var selectedEvalMessage: PromptIntentEvalMessage? {
    guard let selectedEvalMessageID else { return nil }
    return evalMessages.first { $0.id == selectedEvalMessageID }
  }

  var promptIntentCategoryOptions: [PromptIntentCategoryOption] {
    [
      PromptIntentCategoryOption(key: "feature-design", label: "Feature design"),
      PromptIntentCategoryOption(key: "implementation", label: "Implementation"),
      PromptIntentCategoryOption(key: "bug-fixes", label: "Bug fixes"),
      PromptIntentCategoryOption(key: "git-commands", label: "Git commands"),
      PromptIntentCategoryOption(key: "deploy-release-run-build", label: "Deploy/release/run/build"),
      PromptIntentCategoryOption(key: "code-review-qa", label: "Code review/QA"),
      PromptIntentCategoryOption(key: "planning-strategy", label: "Planning/strategy"),
      PromptIntentCategoryOption(key: "research", label: "Research"),
      PromptIntentCategoryOption(key: "documentation", label: "Documentation"),
      PromptIntentCategoryOption(key: "testing-verification", label: "Testing/verification"),
      PromptIntentCategoryOption(key: "refactor-cleanup", label: "Refactor/cleanup"),
      PromptIntentCategoryOption(key: "content-creation", label: "Content creation"),
      PromptIntentCategoryOption(key: "data-analysis", label: "Data/metrics"),
      PromptIntentCategoryOption(key: "feedback-context", label: "Context/observation"),
      PromptIntentCategoryOption(key: "plan-approvals", label: "Plan approvals"),
      PromptIntentCategoryOption(key: "other", label: "Other")
    ]
  }

  var operationalMessageCategoryOptions: [String] {
    Self.operationalPromptCategoryOrder
  }

  var areAllOperationalMessageCategoriesVisible: Bool {
    hiddenOperationalMessageCategories.isDisjoint(with: Self.operationalPromptCategorySet)
  }

  var sortedProjects: [ProjectListItem] {
    projects.sorted { lhs, rhs in
      switch projectSortOption {
      case .mostUserMessages:
        if lhs.messages != rhs.messages {
          return lhs.messages > rhs.messages
        }
      case .fewestUserMessages:
        if lhs.messages != rhs.messages {
          return lhs.messages < rhs.messages
        }
      case .latestSession:
        if lhs.lastSeen != rhs.lastSeen {
          return (lhs.lastSeen ?? "") > (rhs.lastSeen ?? "")
        }
      case .projectName:
        return lhs.project.localizedCaseInsensitiveCompare(rhs.project) == .orderedAscending
      }
      return lhs.project.localizedCaseInsensitiveCompare(rhs.project) == .orderedAscending
    }
  }

  var selectedSessionDateKey: String? {
    guard let selectedSessionID else { return nil }
    return sessionForSelectionID(selectedSessionID)?.dateKey
  }

  var messageModelOptions: [String] {
    let models = summary?.models.map(\.model).filter { !$0.isEmpty } ?? []
    return [AppConstants.allModelsName] + models
  }

  var messageSessionFilterLabel: String? {
    guard let messageSessionFilter else { return nil }
    let shortSession = String(messageSessionFilter.prefix(8))
    guard let messageSessionDateKeyFilter,
      let date = Self.displayDateKey(messageSessionDateKeyFilter)
    else {
      return shortSession
    }
    return "\(shortSession) on \(date)"
  }

  func startIfNeeded() {
    guard !hasStarted else { return }
    hasStarted = true

    Task {
      do {
        status = .starting
        logLoadingNotice = LogLoadingNotice(
          title: "Starting Log Engine",
          message: "Preparing to scan your local Codex logs."
        )
        let connection = try await LocalLogEngineServer.shared.start()
        api = LogEngineAPI(baseURL: connection.baseURL, authToken: connection.authToken)
        startBackgroundSyncIfNeeded()
        refresh()
      } catch {
        logLoadingNotice = nil
        status = .failed(error.localizedDescription)
      }
    }
  }

  var cacheStatusText: String? {
    if isBackgroundSyncing {
      return "Syncing latest logs."
    }
    guard let cacheMetadata else { return nil }
    switch cacheMetadata.cacheStatus {
    case "rebuilt":
      let unit = cacheMetadata.totalFiles == 1 ? "session" : "sessions"
      return "Cache rebuilt with \(cacheMetadata.totalFiles.formatted()) \(unit)."
    case "updated":
      let changes = cacheMetadata.parsedFiles + cacheMetadata.removedFiles
      let unit = changes == 1 ? "session" : "sessions"
      return changes > 0
        ? "Updated \(changes.formatted()) \(unit)."
        : "Up to date."
    case "ready":
      return "Up to date."
    case "checking":
      return "Checking local logs."
    default:
      return nil
    }
  }

  var activityRangeText: String? {
    guard let activity = summary?.activity else { return nil }
    let first = Self.displayDateTime(activity.firstSeen)
    let last = Self.displayDateTime(activity.lastSeen)
    switch (first, last) {
    case (.some(let first), .some(let last)):
      return "First session \(first) - Last session \(last)"
    case (.some(let first), .none):
      return "First session \(first)"
    case (.none, .some(let last)):
      return "Last session \(last)"
    case (.none, .none):
      return nil
    }
  }

  var sourceSummaryText: String {
    guard !sourcePaths.isEmpty else {
      return "Default Codex log locations"
    }
    if sourcePaths.count == 1, let path = sourcePaths.first {
      return URL(fileURLWithPath: path).lastPathComponent.isEmpty ? path : URL(fileURLWithPath: path).lastPathComponent
    }
    return "\(sourcePaths.count.formatted()) custom locations"
  }

  var sourceMenuLabel: String {
    "Source: \(sourceSummaryText)"
  }

  var auditTargetPathText: String {
    auditPreview?.targetPath ?? targetWorklogPath(for: auditRepoPathDraft)
  }

  var auditMergeSummaryText: String {
    guard let auditPreview else {
      return "No audit preview generated."
    }
    let newText = "\(auditPreview.appendedSections.formatted()) new"
    let skippedText = "\(auditPreview.skippedSections.formatted()) already present"
    let generatedText = "\(auditPreview.generatedSections.formatted()) generated"
    return "\(newText), \(skippedText), \(generatedText)"
  }

  var canGenerateAudit: Bool {
    !auditRepoPathDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && api != nil && !isAuditLoading
  }

  var canApproveAudit: Bool {
    auditPreview != nil && !auditReviewMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isAuditLoading
  }

  var dateRangeButtonTitle: String {
    switch dateRangeMode {
    case .all:
      return "All Time"
    case .day:
      return Self.displayDateOnly(sinceDate)
    case .week:
      return "Week of \(Self.displayDateOnly(sinceDate))"
    case .month:
      return Self.displayMonth(dateAnchorDate)
    case .year:
      return Self.displayYear(dateAnchorDate)
    case .custom:
      return "\(Self.displayDateOnly(sinceDate)) - \(Self.displayDateOnly(untilDate))"
    }
  }

  var dateRangeDetailText: String {
    switch dateRangeMode {
    case .all:
      return "Showing all local Codex activity."
    default:
      return "Showing \(Self.displayDateOnly(sinceDate)) through \(Self.displayDateOnly(untilDate))."
    }
  }

  var latestSelectableDate: Date {
    Self.startOfToday()
  }

  func refresh(force: Bool = false, rebuildCache: Bool = false) {
    refresh(force: force, rebuildCache: rebuildCache, mode: .foreground)
  }

  private func refresh(force: Bool = false, rebuildCache: Bool = false, mode: RefreshMode) {
    guard let api else { return }
    if mode == .background, shouldSkipBackgroundSync {
      return
    }

    let shouldRefreshCache = force || rebuildCache || mode == .background
    let shouldShowLoadingNotice = mode == .foreground && (summary == nil || force || rebuildCache)
    if shouldRefreshCache {
      refreshToken += 1
      cacheMetadata = CacheMetadata(
        cacheStatus: "checking",
        reusedFiles: 0,
        parsedFiles: 0,
        removedFiles: 0,
        totalFiles: cacheMetadata?.totalFiles ?? 0,
        updatedAt: Self.isoDateFormatter.string(from: Date())
      )
    }

    reloadTask?.cancel()
    reloadRequestID += 1
    let requestID = reloadRequestID
    let filters = currentFilters(
      refreshToken: shouldRefreshCache ? refreshToken : 0,
      rebuildCache: rebuildCache
    )
    let project = selectedProject
    beginLogRefresh(mode: mode, showLoadingNotice: shouldShowLoadingNotice, rebuildCache: rebuildCache)

    reloadTask = Task {
      do {
        if mode == .foreground {
          status = .loading
        }
        async let projectList = api.projectsWithMetadata(filters: filters)
        async let projectSummary = api.summaryWithMetadata(project: project, filters: filters)
        let (projectsResult, summaryResult) = try await (projectList, projectSummary)
        guard !Task.isCancelled, requestID == reloadRequestID else { return }
        self.projects = projectsResult.projects
        self.summary = summaryResult.summary
        self.cacheMetadata = summaryResult.cache ?? projectsResult.cache
        updateAuditRepoPathSuggestion(force: auditRepoPathDraft.isEmpty)
        let summary = summaryResult.summary
        if messageModelFilter != AppConstants.allModelsName,
          !summary.models.contains(where: { $0.model == messageModelFilter }) {
          messageModelFilter = AppConstants.allModelsName
        }
        if let messageSessionFilter, !hasMessageSessionFilter(in: summary.sessions, sessionID: messageSessionFilter) {
          self.messageSessionFilter = nil
          self.messageSessionFilePathFilter = nil
          self.messageSessionDateKeyFilter = nil
        }
        if let selectedSessionID, !summary.sessions.contains(where: { $0.id == selectedSessionID }) {
          clearSelectedSession()
        }
        if showSessionBrowser && pendingSearchConversationResult == nil {
          selectLatestSessionIfNeeded(in: summary)
        }
        loadBrowseMessages(selectFirstIfNeeded: mode == .foreground && !showSessionBrowser && pendingSearchConversationResult == nil)
        if mode == .background {
          refreshSelectedSessionQuietly(api: api, filters: currentFilters(), project: project)
        } else {
          status = .ready
        }
        finishLogRefresh(requestID: requestID)
        scheduleUITestWorkflowIfNeeded(api: api, filters: filters)
      } catch is CancellationError {
        return
      } catch {
        guard requestID == reloadRequestID else { return }
        finishLogRefresh(requestID: requestID)
        if mode == .foreground {
          status = .failed(error.localizedDescription)
        }
      }
    }
  }

  func retryAfterFailure() {
    guard api != nil else {
      hasStarted = false
      startIfNeeded()
      return
    }
    refresh(force: true)
  }

  func rebuildLocalCache() {
    refresh(rebuildCache: true)
  }

  private var shouldSkipBackgroundSync: Bool {
    guard api != nil else { return true }
    if isLogRefreshInFlight || isDetailLoading || isBrowseMessagesLoading || isAuditLoading {
      return true
    }
    if pendingSearchConversationResult != nil {
      return true
    }
    if case .starting = status {
      return true
    }
    if case .loading = status {
      return true
    }
    return false
  }

  private func startBackgroundSyncIfNeeded() {
    guard backgroundSyncTask == nil, !isEphemeralSettingsRun else { return }
    backgroundSyncTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.backgroundSyncInterval)
        guard !Task.isCancelled else { return }
        self?.syncLatestLogsInBackground()
      }
    }
  }

  private func syncLatestLogsInBackground() {
    refresh(force: true, mode: .background)
  }

  private func beginLogRefresh(mode: RefreshMode, showLoadingNotice: Bool, rebuildCache: Bool) {
    isLogRefreshInFlight = true
    isBackgroundSyncing = mode == .background

    guard mode == .foreground else {
      logLoadingNotice = nil
      return
    }

    if showLoadingNotice {
      logLoadingNotice = LogLoadingNotice(
        title: rebuildCache ? "Rebuilding Local Cache" : "Loading Latest Logs",
        message: rebuildCache
          ? "Reparsing your local Codex sessions. This can take a moment for large histories."
          : "Checking your local Codex sessions for the newest activity."
      )
    } else {
      logLoadingNotice = nil
    }
  }

  private func finishLogRefresh(requestID: Int) {
    guard requestID == reloadRequestID else { return }
    isLogRefreshInFlight = false
    isBackgroundSyncing = false
    logLoadingNotice = nil
  }

  private func refreshSelectedSessionQuietly(api: LogEngineAPI, filters: LogFilters, project: String) {
    guard let selectionID = selectedSessionID,
      selectedSessionDetail != nil,
      !isDetailLoading
    else {
      return
    }

    let target = detailTarget(for: selectionID)
    quietDetailRefreshTask?.cancel()
    quietDetailRefreshRequestID += 1
    let requestID = quietDetailRefreshRequestID

    quietDetailRefreshTask = Task {
      do {
        let detail = try await api.sessionDetail(
          sessionID: target.sessionID,
          filePath: target.filePath,
          dateKey: target.dateKey,
          project: project,
          filters: filters
        )
        guard !Task.isCancelled,
          requestID == quietDetailRefreshRequestID,
          selectedSessionID == selectionID,
          selectedProject == project
        else {
          return
        }
        selectedSessionDetail = detail
        reconcileSelectedUserMessage(in: detail)
      } catch {
        return
      }
    }
  }

  private func reconcileSelectedUserMessage(in detail: SessionDetail) {
    guard let selectedUserMessageIndex else { return }
    let visibleOffsets = visibleUserMessageOffsets(in: detail, dateKey: selectedSessionDateKey)
    if !visibleOffsets.contains(where: { $0.offset == selectedUserMessageIndex }) {
      self.selectedUserMessageIndex = visibleOffsets.last?.offset
    }
  }

  func selectProject(_ project: String) {
    guard selectedProject != project else { return }
    selectedProject = project
    updateAuditRepoPathSuggestion(force: true)
    clearAuditPreview()
    clearSelectionState()
    refresh()
  }

  func applySourcePaths() {
    let paths = pathDraft
      .split(whereSeparator: { $0 == "\n" || $0 == "," })
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    setSourcePaths(paths)
  }

  func chooseSourcePaths() {
    let panel = NSOpenPanel()
    panel.title = "Choose Codex Logs"
    panel.prompt = "Choose"
    panel.canChooseFiles = true
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = true
    panel.canCreateDirectories = false

    guard panel.runModal() == .OK else { return }
    setSourcePaths(panel.urls.map(\.path))
  }

  func useRecentSourcePath(_ path: String) {
    setSourcePaths([path])
  }

  func removeSourcePath(_ path: String) {
    setSourcePaths(sourcePaths.filter { $0 != path })
  }

  func resetSourcePaths() {
    setSourcePaths([])
  }

  func filtersChanged() {
    saveSettings()
    clearAuditPreview()
    clearSelectionState()
    refresh()
  }

  func setDateRangeMode(_ mode: DateRangeMode) {
    guard dateRangeMode != mode else { return }
    dateRangeMode = mode
    applyDateRangeMode()
  }

  func setProjectSortOption(_ option: ProjectSortOption) {
    guard projectSortOption != option else { return }
    projectSortOption = option
    saveSettings()
  }

  func setRepeatedPromptCategory(_ category: String, isVisible: Bool) {
    var updatedCategories = hiddenRepeatedPromptCategories
    if isVisible {
      updatedCategories.remove(category)
    } else {
      updatedCategories.insert(category)
    }
    hiddenRepeatedPromptCategories = updatedCategories
    saveSettings()
  }

  func setOperationalMessageCategory(_ category: String, isVisible: Bool) {
    guard isOperationalPromptCategory(category) else { return }
    var updatedCategories = hiddenOperationalMessageCategories
    if isVisible {
      updatedCategories.remove(category)
    } else {
      updatedCategories.insert(category)
    }
    hiddenOperationalMessageCategories = updatedCategories
    saveSettings()
    reconcileOperationalMessageFilters()
    refreshSearchForOperationalFilterChangeIfNeeded()
  }

  func setAllOperationalMessageCategoriesVisible(_ isVisible: Bool) {
    var updatedCategories = hiddenOperationalMessageCategories
    if isVisible {
      updatedCategories.subtract(Self.operationalPromptCategorySet)
    } else {
      updatedCategories.formUnion(Self.operationalPromptCategorySet)
    }
    hiddenOperationalMessageCategories = updatedCategories
    saveSettings()
    reconcileOperationalMessageFilters()
    refreshSearchForOperationalFilterChangeIfNeeded()
  }

  func isOperationalPromptCategory(_ category: String) -> Bool {
    Self.operationalPromptCategorySet.contains(category)
  }

  func isOperationalPromptCategoryVisible(_ category: String) -> Bool {
    !hiddenOperationalMessageCategories.contains(category)
  }

  func setDateAnchorDate(_ date: Date) {
    dateAnchorDate = Self.clampedToToday(date)
    guard dateRangeMode != .all, dateRangeMode != .custom else {
      saveSettings()
      return
    }
    applyDateRangeMode()
  }

  func setCustomSinceDate(_ date: Date) {
    dateRangeMode = .custom
    sinceDate = Self.clampedToToday(date)
    untilDate = Self.clampedToToday(untilDate)
    if untilDate < sinceDate {
      untilDate = sinceDate
    }
    applyDateRangeMode()
  }

  func setCustomUntilDate(_ date: Date) {
    dateRangeMode = .custom
    sinceDate = Self.clampedToToday(sinceDate)
    untilDate = Self.clampedToToday(date)
    if sinceDate > untilDate {
      sinceDate = untilDate
    }
    applyDateRangeMode()
  }

  func clearDateRange() {
    guard dateRangeMode != .all || hasSinceFilter || hasUntilFilter else { return }
    dateRangeMode = .all
    applyDateRangeMode()
  }

  func setSessionBrowserVisible(_ isVisible: Bool) {
    guard showSessionBrowser != isVisible else { return }
    showSessionBrowser = isVisible
    saveSettings()
    if isVisible {
      if let summary {
        selectLatestSessionIfNeeded(in: summary)
      }
    } else if selectedBrowseMessageID == nil {
      loadBrowseMessages(selectFirstIfNeeded: true)
    }
  }

  func selectSession(_ sessionID: SessionSummary.ID?) {
    selectedSessionID = sessionID
    selectedUserMessageIndex = nil
    if !selectedBrowseMessageBelongsToSession(sessionID) {
      selectedBrowseMessageID = nil
    }
    pendingSearchResultTarget = nil
    if !selectedSearchResultBelongsToSession(sessionID) {
      selectedSearchResultID = nil
    }
    selectedSessionDetail = nil
    loadSelectedSession()
  }

  func loadSelectedSession() {
    guard let selectionID = selectedSessionID, let api else {
      selectedSessionDetail = nil
      isDetailLoading = false
      return
    }
    let target = detailTarget(for: selectionID)

    quietDetailRefreshTask?.cancel()
    quietDetailRefreshRequestID += 1
    detailTask?.cancel()
    detailRequestID += 1
    let requestID = detailRequestID
    let filters = currentFilters()
    let project = selectedProject

    detailTask = Task {
      do {
        isDetailLoading = true
        let detail = try await api.sessionDetail(
          sessionID: target.sessionID,
          filePath: target.filePath,
          dateKey: target.dateKey,
          project: project,
          filters: filters
        )
        guard !Task.isCancelled, requestID == detailRequestID else { return }
        selectedSessionDetail = detail
        applyPendingMessageSelection(to: detail)
        isDetailLoading = false
      } catch is CancellationError {
        return
      } catch {
        guard requestID == detailRequestID else { return }
        isDetailLoading = false
        status = .failed(error.localizedDescription)
      }
    }
  }

  func loadBrowseMessages(selectFirstIfNeeded: Bool = false) {
    guard let api else {
      browseMessagesSummary = nil
      selectedBrowseMessageID = nil
      isBrowseMessagesLoading = false
      return
    }

    browseMessagesTask?.cancel()
    browseMessagesRequestID += 1
    let requestID = browseMessagesRequestID
    let filters = currentFilters()
    let project = selectedProject
    let limit = max(summary?.totals.userMessages ?? 100, 100)

    browseMessagesTask = Task {
      do {
        isBrowseMessagesLoading = true
        let searchResult = try await api.searchMessagesWithMetadata(
          query: "",
          role: .user,
          model: AppConstants.allModelsName,
          sessionID: nil,
          project: project,
          filters: filters,
          submittedOnly: true,
          limit: limit
        )
        guard !Task.isCancelled, requestID == browseMessagesRequestID else { return }
        browseMessagesSummary = searchResult.search
        cacheMetadata = searchResult.cache ?? cacheMetadata
        isBrowseMessagesLoading = false
        let visibleResults = visibleBrowseMessages(in: searchResult.search.results)

        let currentSelectionIsVisible = selectedBrowseMessageID.map { selectedID in
          visibleResults.contains { $0.id == selectedID }
        } ?? false

        if !currentSelectionIsVisible {
          selectedBrowseMessageID = nil
          if !showSessionBrowser {
            clearSelectedSession()
          }
        }

        if selectFirstIfNeeded, selectedBrowseMessageID == nil, let firstMessage = visibleResults.first {
          selectBrowseMessage(firstMessage.id)
        }
        if let pendingSearchConversationResult {
          self.pendingSearchConversationResult = nil
          showConversation(for: pendingSearchConversationResult)
        } else if selectedBrowseMessageID == nil,
          let detail = selectedSessionDetail {
          syncBrowseSelectionToSelectedUserMessage(in: detail)
        }
      } catch is CancellationError {
        return
      } catch {
        guard requestID == browseMessagesRequestID else { return }
        isBrowseMessagesLoading = false
        status = .failed(error.localizedDescription)
      }
    }
  }

  func selectBrowseMessage(_ messageID: MessageSearchResult.ID?) {
    selectedBrowseMessageID = messageID
    guard let messageID,
      let result = browseMessagesSummary?.results.first(where: { $0.id == messageID })
    else {
      selectedUserMessageIndex = nil
      selectedSessionID = nil
      selectedSessionDetail = nil
      return
    }

    selectedSearchResultID = nil
    pendingSearchResultTarget = SearchResultSelectionTarget(result)
    selectedUserMessageIndex = nil
    selectedSessionID = sessionSelectionID(
      sessionID: result.sessionId,
      filePath: result.filePath,
      dateKey: result.dateKey
    ) ?? result.sessionId
    selectedSessionDetail = nil
    loadSelectedSession()
  }

  func searchMessages(activateSearch: Bool = true) {
    if activateSearch {
      selectedSection = .search
    }
    let trimmedQuery = messageQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty, let api else {
      clearSearchResults()
      return
    }

    searchTask?.cancel()
    searchRequestID += 1
    selectedSearchResultID = nil
    let requestID = searchRequestID
    let filters = currentFilters()
    let project = selectedProject
    let role = messageRoleFilter
    let model = messageModelFilter
    let sessionID = messageSessionFilter
    let filePath = messageSessionFilePathFilter
    let dateKey = messageSessionDateKeyFilter
    let submittedOnly = role == .user
    let hiddenCategories = Array(hiddenOperationalMessageCategories).sorted()

    searchTask = Task {
      do {
        status = .loading
        let searchResult = try await api.searchMessagesWithMetadata(
          query: trimmedQuery,
          role: role,
          model: model,
          sessionID: sessionID,
          filePath: filePath,
          dateKey: dateKey,
          project: project,
          filters: filters,
          submittedOnly: submittedOnly,
          hiddenCategories: hiddenCategories
        )
        guard !Task.isCancelled, requestID == searchRequestID else { return }
        searchSummary = searchResult.search
        if let selectedSearchResultID,
          !searchResult.search.results.contains(where: { $0.id == selectedSearchResultID }) {
          self.selectedSearchResultID = nil
        }
        cacheMetadata = searchResult.cache ?? cacheMetadata
        status = .ready
      } catch is CancellationError {
        return
      } catch {
        guard requestID == searchRequestID else { return }
        status = .failed(error.localizedDescription)
      }
    }
  }

  func refreshMessageResults() {
    searchMessages(activateSearch: false)
  }

  func loadEvals(selectFirstIfNeeded: Bool = false) {
    guard let api else {
      evalsSummary = nil
      selectedEvalMessageID = nil
      evalReviewNote = ""
      isEvalsLoading = false
      return
    }

    evalsTask?.cancel()
    evalsRequestID += 1
    let requestID = evalsRequestID
    let filters = LogFilters(paths: sourcePaths)
    let project = AppConstants.allProjectsName
    let query = evalQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    let categoryKey = evalCategoryKeyFilter
    let reviewState = evalReviewStateFilter

    evalsTask = Task {
      do {
        isEvalsLoading = true
        evalsStatusMessage = nil
        let result = try await api.evalMessagesWithMetadata(
          query: query,
          categoryKey: categoryKey,
          reviewState: reviewState,
          project: project,
          filters: filters,
          limit: 1_000
        )
        guard !Task.isCancelled, requestID == evalsRequestID else { return }
        evalsSummary = result.evals
        cacheMetadata = result.cache ?? cacheMetadata
        isEvalsLoading = false
        if let selectedEvalMessageID,
          !result.evals.results.contains(where: { $0.id == selectedEvalMessageID }) {
          self.selectedEvalMessageID = nil
          evalReviewNote = ""
        }
        if selectFirstIfNeeded || self.selectedEvalMessageID == nil {
          selectEvalMessage(result.evals.results.first?.id)
        }
      } catch is CancellationError {
        return
      } catch {
        guard requestID == evalsRequestID else { return }
        isEvalsLoading = false
        evalsStatusMessage = error.localizedDescription
      }
    }
  }

  func setEvalCategoryFilter(_ categoryKey: String?) {
    evalCategoryKeyFilter = categoryKey
    loadEvals(selectFirstIfNeeded: true)
  }

  func setEvalReviewStateFilter(_ state: EvalReviewStateFilter) {
    evalReviewStateFilter = state
    loadEvals(selectFirstIfNeeded: true)
  }

  func selectEvalMessage(_ messageID: PromptIntentEvalMessage.ID?) {
    selectedEvalMessageID = messageID
    evalReviewNote = selectedEvalMessage?.review?.note ?? ""
  }

  func markSelectedEvalCorrect() {
    guard let message = selectedEvalMessage else { return }
    saveEvalReview(for: message, expectedKey: message.promptIntentKey, note: evalReviewNote)
  }

  func saveEvalReview(for message: PromptIntentEvalMessage, expectedKey: String, note: String) {
    guard let api else { return }
    evalReviewTask?.cancel()
    evalReviewRequestID += 1
    let requestID = evalReviewRequestID
    let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

    evalReviewTask = Task {
      do {
        _ = try await api.saveEvalReview(
          evalId: message.evalId,
          actualKey: message.promptIntentKey,
          expectedKey: expectedKey,
          note: trimmedNote.isEmpty ? nil : trimmedNote
        )
        guard !Task.isCancelled, requestID == evalReviewRequestID else { return }
        loadEvals()
      } catch is CancellationError {
        return
      } catch {
        guard requestID == evalReviewRequestID else { return }
        evalsStatusMessage = error.localizedDescription
      }
    }
  }

  func clearEvalReview(_ message: PromptIntentEvalMessage) {
    guard let api else { return }
    evalReviewTask?.cancel()
    evalReviewRequestID += 1
    let requestID = evalReviewRequestID

    evalReviewTask = Task {
      do {
        try await api.deleteEvalReview(evalId: message.evalId)
        guard !Task.isCancelled, requestID == evalReviewRequestID else { return }
        evalReviewNote = ""
        loadEvals()
      } catch is CancellationError {
        return
      } catch {
        guard requestID == evalReviewRequestID else { return }
        evalsStatusMessage = error.localizedDescription
      }
    }
  }

  func showConversation(for evalMessage: PromptIntentEvalMessage) {
    pendingSearchConversationResult = MessageSearchResult(
      id: evalMessage.evalId,
      sessionId: evalMessage.sessionId,
      filePath: evalMessage.filePath,
      dateKey: evalMessage.dateKey,
      project: evalMessage.project,
      cwd: evalMessage.cwd,
      lineNumber: evalMessage.lineNumber,
      turnId: evalMessage.turnId,
      model: nil,
      timestamp: evalMessage.timestamp,
      role: "user",
      sourceEvent: "event_msg.user_message",
      category: nil,
      promptIntentKey: evalMessage.promptIntentKey,
      promptIntent: evalMessage.promptIntent,
      snippet: evalMessage.snippet,
      content: evalMessage.content
    )
    selectedProject = AppConstants.allProjectsName
    if let date = Self.dateFormatter.date(from: evalMessage.dateKey) {
      hasSinceFilter = true
      hasUntilFilter = true
      sinceDate = date
      untilDate = date
      dateRangeMode = .day
      dateAnchorDate = date
    }
    selectedSection = .browse
    refresh()
    Self.restoreViewerWindow(activate: true)
  }

  func focusMessageSearch() {
    selectedSection = .search
    messageSearchFocusRequest += 1
  }

  func selectSearchResult(_ resultID: MessageSearchResult.ID?) {
    selectedSearchResultID = resultID
    guard let resultID,
      let result = searchResults.first(where: { $0.id == resultID })
    else {
      return
    }

    let targetProject = projectScopeForSearchConversation(result)
    if selectedProject != targetProject {
      pendingSearchConversationResult = result
      selectProject(targetProject)
      return
    }

    showConversation(for: result)
  }

  private func projectScopeForSearchConversation(_ result: MessageSearchResult) -> String {
    if selectedProject == AppConstants.allProjectsName {
      return AppConstants.allProjectsName
    }
    return result.project.isEmpty ? selectedProject : result.project
  }

  private func showConversation(for result: MessageSearchResult) {
    selectedSection = .browse
    selectedBrowseMessageID = browseMessageID(for: result)
    pendingSearchResultTarget = SearchResultSelectionTarget(result)
    selectedUserMessageIndex = nil
    selectedSessionID = sessionSelectionID(
      sessionID: result.sessionId,
      filePath: result.filePath,
      dateKey: result.dateKey
    ) ?? result.sessionId
    selectedSessionDetail = nil
    loadSelectedSession()
  }

  func limitMessageSearchToSelectedSession() {
    guard let selectedSessionID else { return }
    let target = detailTarget(for: selectedSessionID)
    messageSessionFilter = target.sessionID
    messageSessionFilePathFilter = target.filePath
    messageSessionDateKeyFilter = target.dateKey
    if searchSummary != nil {
      refreshMessageResults()
    }
  }

  func clearMessageSessionFilter() {
    messageSessionFilter = nil
    messageSessionFilePathFilter = nil
    messageSessionDateKeyFilter = nil
    if searchSummary != nil {
      refreshMessageResults()
    }
  }

  func copySearchResultSessionID(_ result: MessageSearchResult) {
    copyTextToPasteboard(result.sessionId)
  }

  func copySearchResultProject(_ result: MessageSearchResult) {
    copyTextToPasteboard(result.project)
  }

  func copySearchResultSnippet(_ result: MessageSearchResult) {
    copyTextToPasteboard(Self.sanitizedClipboardSnippet(result.snippet))
  }

  func exportSummary(_ format: ExportFormat) {
    guard let api else { return }
    let panel = NSSavePanel()
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = exportFilename(format)
    panel.directoryURL = defaultExportDirectoryURL()
    if format == .json, !confirmJsonExport() {
      return
    }
    guard panel.runModal() == .OK, let destinationURL = panel.url else { return }

    let filters = currentFilters()
    let project = selectedProject
    Task {
      do {
        status = .loading
        let data = try await api.exportSummary(format: format, project: project, filters: filters)
        try data.write(to: destinationURL)
        rememberExportDirectory(destinationURL.deletingLastPathComponent())
        status = .ready
      } catch {
        status = .failed(error.localizedDescription)
      }
    }
  }

  func exportEvalFixtureDraft() {
    guard let api else { return }
    let panel = NSSavePanel()
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = "project-focus-reviewed-fixture-draft.json"
    panel.directoryURL = defaultExportDirectoryURL()
    if !confirmEvalFixtureDraftExport() {
      return
    }
    guard panel.runModal() == .OK, let destinationURL = panel.url else { return }

    let filters = currentFilters()
    Task {
      do {
        isEvalsLoading = true
        evalsStatusMessage = nil
        let data = try await api.exportEvalFixtureDraft(filters: filters)
        try data.write(to: destinationURL)
        rememberExportDirectory(destinationURL.deletingLastPathComponent())
        isEvalsLoading = false
      } catch {
        isEvalsLoading = false
        evalsStatusMessage = error.localizedDescription
      }
    }
  }

  func chooseAuditRepoPath() {
    let panel = NSOpenPanel()
    panel.title = "Choose Repository"
    panel.prompt = "Choose"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.canCreateDirectories = false

    guard panel.runModal() == .OK, let url = panel.url else { return }
    setAuditRepoPathDraft(url.path)
  }

  func auditRepoPathChanged() {
    clearAuditPreview()
  }

  func setAuditRepoPathDraft(_ path: String) {
    guard auditRepoPathDraft != path else { return }
    auditRepoPathDraft = path
    clearAuditPreview()
  }

  func generateAuditPreview() {
    guard let api else { return }
    let repoPath = auditRepoPathDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !repoPath.isEmpty else { return }

    auditTask?.cancel()
    auditRequestID += 1
    let requestID = auditRequestID
    let filters = currentFilters()
    let includeResponses = auditIncludeResponses

    auditTask = Task {
      do {
        isAuditLoading = true
        auditStatusMessage = "Generating audit preview."
        let preview = try await api.auditPreview(
          repoPath: repoPath,
          project: AppConstants.allProjectsName,
          filters: filters,
          includeResponses: includeResponses
        )
        guard !Task.isCancelled, requestID == auditRequestID else { return }
        auditPreview = preview
        auditReviewMarkdown = preview.mergedMarkdown
        auditStatusMessage = auditStatusText(for: preview)
        isAuditLoading = false
      } catch is CancellationError {
        return
      } catch {
        guard requestID == auditRequestID else { return }
        isAuditLoading = false
        status = .failed(error.localizedDescription)
      }
    }
  }

  func approveAuditMarkdown() {
    guard let api,
      let auditPreview,
      !auditRepoPathDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      confirmAuditWrite(targetPath: auditPreview.targetPath)
    else {
      return
    }
    let repoPath = auditRepoPathDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    let markdown = auditReviewMarkdown

    auditTask?.cancel()
    auditRequestID += 1
    let requestID = auditRequestID
    auditTask = Task {
      do {
        isAuditLoading = true
        auditStatusMessage = "Saving audit worklog."
        let result = try await api.writeAudit(repoPath: repoPath, targetPath: auditPreview.targetPath, markdown: markdown)
        guard !Task.isCancelled, requestID == auditRequestID else { return }
        auditStatusMessage = "Saved \(result.bytesWritten.formatted()) bytes to \(URL(fileURLWithPath: result.targetPath).lastPathComponent)."
        isAuditLoading = false
      } catch is CancellationError {
        return
      } catch {
        guard requestID == auditRequestID else { return }
        isAuditLoading = false
        status = .failed(error.localizedDescription)
      }
    }
  }

  func openAuditWorklog() {
    guard let auditPreview else { return }
    NSWorkspace.shared.open(URL(fileURLWithPath: auditPreview.targetPath))
  }

  func setAuditIncludeResponses(_ includeResponses: Bool) {
    guard auditIncludeResponses != includeResponses else { return }
    auditIncludeResponses = includeResponses
    clearAuditPreview()
  }

  private func clearAuditPreview() {
    auditTask?.cancel()
    auditRequestID += 1
    auditPreview = nil
    auditReviewMarkdown = ""
    auditStatusMessage = nil
    isAuditLoading = false
  }

  private func updateAuditRepoPathSuggestion(force: Bool) {
    guard selectedProject != AppConstants.allProjectsName,
      let project = projects.first(where: { $0.project == selectedProject }),
      let suggestedPath = project.cwdSamples.first
    else {
      if force {
        auditRepoPathDraft = ""
      }
      return
    }

    if force || auditRepoPathDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      auditRepoPathDraft = suggestedPath
    }
  }

  private func auditStatusText(for preview: AuditPreview) -> String {
    if preview.appendedSections == 0 {
      return "No new generated sections. Existing worklog is up to date for this selection."
    }
    let sectionText = preview.appendedSections == 1 ? "section" : "sections"
    return "Ready to review \(preview.appendedSections.formatted()) new \(sectionText)."
  }

  private func targetWorklogPath(for repoPath: String) -> String {
    let trimmed = repoPath.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "docs/ai-worklog.md" }
    return URL(fileURLWithPath: trimmed)
      .appendingPathComponent("docs")
      .appendingPathComponent("ai-worklog.md")
      .path
  }

  private func confirmAuditWrite(targetPath: String) -> Bool {
    let alert = NSAlert()
    alert.messageText = "Save Audit Worklog?"
    alert.informativeText = "This writes the reviewed Markdown to \(targetPath). Review the preview for private content before saving."
    alert.alertStyle = .informational
    alert.addButton(withTitle: "Save")
    alert.addButton(withTitle: "Cancel")
    return alert.runModal() == .alertFirstButtonReturn
  }

  private func clearSelectionState() {
    clearSelectedSession()
    clearBrowseMessages()
    clearSearchResults()
  }

  private func clearSelectedSession() {
    quietDetailRefreshTask?.cancel()
    quietDetailRefreshRequestID += 1
    detailTask?.cancel()
    detailRequestID += 1
    selectedSessionID = nil
    selectedSessionDetail = nil
    selectedUserMessageIndex = nil
    selectedBrowseMessageID = nil
    pendingSearchResultTarget = nil
    isDetailLoading = false
  }

  private func clearBrowseMessages() {
    browseMessagesTask?.cancel()
    browseMessagesRequestID += 1
    browseMessagesSummary = nil
    selectedBrowseMessageID = nil
    isBrowseMessagesLoading = false
  }

  private func clearSearchResults() {
    searchTask?.cancel()
    searchRequestID += 1
    selectedSearchResultID = nil
    pendingSearchResultTarget = nil
    messageSessionFilter = nil
    messageSessionFilePathFilter = nil
    messageSessionDateKeyFilter = nil
    searchSummary = nil
  }

  private func selectLatestSessionIfNeeded(in summary: ProjectSummary) {
    guard selectedSessionID == nil, let latestSession = summary.sessions.first else {
      return
    }

    selectedSessionID = latestSession.id
    selectedSessionDetail = nil
    selectedUserMessageIndex = nil
    pendingSearchResultTarget = nil
    loadSelectedSession()
  }

  private func selectedSearchResultBelongsToSession(_ sessionID: SessionSummary.ID?) -> Bool {
    guard let sessionID,
      let selectedSearchResultID,
      let result = searchSummary?.results.first(where: { $0.id == selectedSearchResultID })
    else {
      return false
    }
    if let session = sessionForSelectionID(sessionID) {
      return result.sessionId == session.sessionId &&
        result.filePath == session.filePath &&
        (result.dateKey == nil || result.dateKey == session.dateKey)
    }
    return result.sessionId == sessionID
  }

  private func selectedBrowseMessageBelongsToSession(_ sessionID: SessionSummary.ID?) -> Bool {
    guard let sessionID,
      let selectedBrowseMessageID,
      let result = browseMessagesSummary?.results.first(where: { $0.id == selectedBrowseMessageID })
    else {
      return false
    }
    if let session = sessionForSelectionID(sessionID) {
      return result.sessionId == session.sessionId &&
        result.filePath == session.filePath &&
        (result.dateKey == nil || result.dateKey == session.dateKey)
    }
    return result.sessionId == sessionID
  }

  private func visibleBrowseMessages(in messages: [MessageSearchResult]) -> [MessageSearchResult] {
    return messages.filter(isBrowseMessageVisible)
  }

  private func visibleSearchResults(in messages: [MessageSearchResult]) -> [MessageSearchResult] {
    return messages.filter(isSearchResultVisible)
  }

  private func isBrowseMessageVisible(_ message: MessageSearchResult) -> Bool {
    isSearchResultVisible(message)
  }

  private func isSearchResultVisible(_ message: MessageSearchResult) -> Bool {
    guard let category = message.category else { return true }
    return !hiddenOperationalMessageCategories.contains(category)
  }

  func visibleUserMessageOffsets(in detail: SessionDetail, dateKey: String? = nil) -> [(offset: Int, element: MessageDetail)] {
    SessionInteractionBuilder.userMessageOffsets(in: detail, dateKey: dateKey)
      .filter { isMessageDetailVisible($0.element) }
  }

  func isMessageDetailVisible(_ message: MessageDetail) -> Bool {
    guard let category = message.category else { return true }
    return !hiddenOperationalMessageCategories.contains(category)
  }

  func visiblePromptIntentSummary(_ summary: PromptIntentSummary) -> PromptIntentSummary {
    let visibleBuckets = summary.buckets
      .filter { !hiddenOperationalMessageCategories.contains($0.label) }
    let totalMessages = visibleBuckets.reduce(0) { $0 + $1.count }
    let unclassifiedMessages = visibleBuckets
      .filter { $0.key == "other" }
      .reduce(0) { $0 + $1.count }
    let buckets = visibleBuckets.map { bucket in
      PromptIntentBucket(
        key: bucket.key,
        label: bucket.label,
        count: bucket.count,
        percentage: totalMessages > 0 ? Double((Double(bucket.count) / Double(totalMessages) * 1000).rounded()) / 10 : 0,
        sessionCount: bucket.sessionCount,
        projects: bucket.projects,
        examples: bucket.examples,
        firstSeen: bucket.firstSeen,
        lastSeen: bucket.lastSeen
      )
    }

    return PromptIntentSummary(
      totalMessages: totalMessages,
      classifiedMessages: totalMessages - unclassifiedMessages,
      unclassifiedMessages: unclassifiedMessages,
      buckets: buckets
    )
  }

  private func reconcileOperationalMessageFilters() {
    if let browseMessagesSummary,
      let selectedBrowseMessageID,
      let selected = browseMessagesSummary.results.first(where: { $0.id == selectedBrowseMessageID }),
      !isBrowseMessageVisible(selected) {
      selectBrowseMessage(browseMessages.first?.id)
    }

    if let searchSummary,
      let selectedSearchResultID,
      let selected = searchSummary.results.first(where: { $0.id == selectedSearchResultID }),
      !isSearchResultVisible(selected) {
      self.selectedSearchResultID = searchResults.first?.id
    }

    if let detail = selectedSessionDetail,
      let selectedUserMessageIndex,
      let selectedMessage = detail.messages.indices.contains(selectedUserMessageIndex)
        ? detail.messages[selectedUserMessageIndex]
        : nil,
      !isMessageDetailVisible(selectedMessage) {
      self.selectedUserMessageIndex = visibleUserMessageOffsets(in: detail, dateKey: selectedSessionDateKey).last?.offset
    }
  }

  private func refreshSearchForOperationalFilterChangeIfNeeded() {
    guard searchSummary != nil else { return }
    refreshMessageResults()
  }

  private func detailTarget(for selectionID: SessionSummary.ID) -> (sessionID: String, filePath: String?, dateKey: String?) {
    if let session = sessionForSelectionID(selectionID) {
      return (session.sessionId, session.filePath, session.dateKey)
    }
    if let selectedSearchResultID,
      let result = searchSummary?.results.first(where: { $0.id == selectedSearchResultID && $0.sessionId == selectionID })
    {
      return (result.sessionId, result.filePath, result.dateKey)
    }
    if let selectedBrowseMessageID,
      let result = browseMessagesSummary?.results.first(where: { $0.id == selectedBrowseMessageID && $0.sessionId == selectionID })
    {
      return (result.sessionId, result.filePath, result.dateKey)
    }
    return (selectionID, nil, nil)
  }

  private func sessionForSelectionID(_ selectionID: SessionSummary.ID) -> SessionSummary? {
    summary?.sessions.first { $0.id == selectionID }
  }

  private func sessionSelectionID(sessionID: String, filePath: String, dateKey: String?) -> SessionSummary.ID? {
    if let dateKey,
      let exact = summary?.sessions.first(where: { $0.sessionId == sessionID && $0.filePath == filePath && $0.dateKey == dateKey }) {
      return exact.id
    }
    return summary?.sessions.first { $0.sessionId == sessionID && $0.filePath == filePath }?.id
  }

  private func applyPendingMessageSelection(to detail: SessionDetail) {
    guard let pendingSearchResultTarget else {
      let userMessageOffsets = visibleUserMessageOffsets(in: detail, dateKey: selectedSessionDateKey)
      if let selectedUserMessageIndex,
        userMessageOffsets.contains(where: { $0.offset == selectedUserMessageIndex }) {
        return
      }
      selectedUserMessageIndex = userMessageOffsets.last?.offset
      return
    }
    selectedUserMessageIndex = userMessageIndex(for: pendingSearchResultTarget, in: detail)
    syncBrowseSelectionToSelectedUserMessage(in: detail)
    self.pendingSearchResultTarget = nil
  }

  private func syncBrowseSelectionToSelectedUserMessage(in detail: SessionDetail) {
    guard let selectedUserMessageIndex,
      detail.messages.indices.contains(selectedUserMessageIndex)
    else {
      selectedBrowseMessageID = nil
      return
    }

    selectedBrowseMessageID = browseMessageID(
      for: detail.messages[selectedUserMessageIndex],
      in: detail
    )
  }

  private func browseMessageID(for result: MessageSearchResult) -> MessageSearchResult.ID? {
    guard result.sourceEvent == "event_msg.user_message" else { return nil }
    return visibleBrowseMessages(in: browseMessagesSummary?.results ?? [])
      .first { browseResultRepresentsSameUserMessage($0, as: result) }?
      .id
  }

  private func browseMessageID(
    for message: MessageDetail,
    in detail: SessionDetail
  ) -> MessageSearchResult.ID? {
    guard message.sourceEvent == "event_msg.user_message" else { return nil }
    return visibleBrowseMessages(in: browseMessagesSummary?.results ?? [])
      .first { result in
        browseResultRepresentsUserMessage(result, message: message, detail: detail)
      }?
      .id
  }

  private func browseResultRepresentsSameUserMessage(
    _ browseResult: MessageSearchResult,
    as target: MessageSearchResult
  ) -> Bool {
    guard browseResult.sourceEvent == "event_msg.user_message",
      browseResult.sessionId == target.sessionId,
      browseResult.filePath == target.filePath,
      browseResult.dateKey == target.dateKey,
      browseResult.role == target.role,
      browseResult.sourceEvent == target.sourceEvent
    else {
      return false
    }

    if let lineNumber = target.lineNumber {
      return browseResult.lineNumber == lineNumber
    }
    if let turnId = target.turnId {
      return browseResult.turnId == turnId && browseResult.content == target.content
    }
    return browseResult.timestamp == target.timestamp && browseResult.content == target.content
  }

  private func browseResultRepresentsUserMessage(
    _ result: MessageSearchResult,
    message: MessageDetail,
    detail: SessionDetail
  ) -> Bool {
    guard result.sourceEvent == "event_msg.user_message",
      result.sessionId == detail.file.sessionId,
      result.filePath == detail.file.filePath,
      result.dateKey == codexLocalDateKey(message.timestamp),
      result.role == message.role,
      result.sourceEvent == message.sourceEvent
    else {
      return false
    }

    if let lineNumber = message.lineNumber {
      return result.lineNumber == lineNumber
    }
    if let turnId = message.turnId {
      return result.turnId == turnId && result.content == message.content
    }
    return result.timestamp == message.timestamp && result.content == message.content
  }

  private func userMessageIndex(for target: SearchResultSelectionTarget, in detail: SessionDetail) -> Int? {
    let userMessageOffsets = SessionInteractionBuilder.userMessageOffsets(in: detail)
    guard !userMessageOffsets.isEmpty else { return nil }

    if target.sourceEvent == "event_msg.user_message" {
      if let lineNumber = target.lineNumber,
        let exactMatch = userMessageOffsets.first(where: { $0.element.lineNumber == lineNumber }) {
        return exactMatch.offset
      }
      if let turnId = target.turnId,
        let turnMatch = userMessageOffsets.first(where: { $0.element.turnId == turnId }) {
        return turnMatch.offset
      }
    }

    if let containingInteraction = userMessageOffsets.first(where: { item in
      guard let interaction = SessionInteractionBuilder.interaction(in: detail, selectedUserMessageIndex: item.offset) else {
        return false
      }
      return interactionContains(target, interaction: interaction)
    }) {
      return containingInteraction.offset
    }

    if let targetOffset = detail.messages.firstIndex(where: { messageMatchesTarget($0, target: target) }) {
      return userMessageOffsets.last(where: { $0.offset <= targetOffset })?.offset ?? userMessageOffsets.first?.offset
    }

    if let targetLineNumber = target.lineNumber {
      return userMessageOffsets.last(where: { ($0.element.lineNumber ?? Int.min) <= targetLineNumber })?.offset ??
        userMessageOffsets.first(where: { ($0.element.lineNumber ?? Int.max) > targetLineNumber })?.offset
    }

    if let turnId = target.turnId {
      return userMessageOffsets.first(where: { $0.element.turnId == turnId })?.offset
    }

    return nil
  }

  private func interactionContains(_ target: SearchResultSelectionTarget, interaction: SessionInteraction) -> Bool {
    if messageMatchesTarget(interaction.userMessage, target: target) {
      return true
    }
    return interaction.assistantMessages.contains { messageMatchesTarget($0, target: target) } ||
      interaction.contextMessages.contains { messageMatchesTarget($0, target: target) }
  }

  private func messageMatchesTarget(_ message: MessageDetail, target: SearchResultSelectionTarget) -> Bool {
    if let lineNumber = target.lineNumber {
      return message.lineNumber == lineNumber &&
        message.sourceEvent == target.sourceEvent &&
        message.role == target.role
    }
    if let turnId = target.turnId {
      return message.turnId == turnId &&
        message.sourceEvent == target.sourceEvent &&
        message.role == target.role
    }
    return message.sourceEvent == target.sourceEvent && message.role == target.role
  }

  private func hasMessageSessionFilter(in sessions: [SessionSummary], sessionID: String) -> Bool {
    sessions.contains { session in
      guard let messageSessionFilePathFilter else {
        return session.sessionId == sessionID
      }
      let sameSession = session.sessionId == sessionID && session.filePath == messageSessionFilePathFilter
      guard let messageSessionDateKeyFilter else {
        return sameSession
      }
      return sameSession && session.dateKey == messageSessionDateKeyFilter
    }
  }

  private func setSourcePaths(_ paths: [String]) {
    let uniquePaths = uniqueNonEmptyPaths(paths)
    sourcePaths = uniquePaths
    pathDraft = uniquePaths.joined(separator: "\n")
    updateRecentSourcePaths(uniquePaths)
    saveSettings()
    selectedProject = AppConstants.allProjectsName
    clearSelectionState()
    refresh(force: true)
    DispatchQueue.main.async {
      Self.restoreViewerWindow(activate: true)
    }
  }

  private func uniqueNonEmptyPaths(_ paths: [String]) -> [String] {
    var seen = Set<String>()
    return paths.compactMap { path in
      let trimmed = path.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty, !seen.contains(trimmed) else { return nil }
      seen.insert(trimmed)
      return trimmed
    }
  }

  private func updateRecentSourcePaths(_ paths: [String]) {
    guard !paths.isEmpty else { return }
    let merged = paths + recentSourcePaths
    recentSourcePaths = Array(uniqueNonEmptyPaths(merged).prefix(8))
  }

  private func loadSettings() {
    if let initialPaths = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_INITIAL_PATHS"], !initialPaths.isEmpty {
      sourcePaths = uniqueNonEmptyPaths(
        initialPaths
          .split(separator: "\n")
          .flatMap { $0.split(separator: ",") }
          .map(String.init)
      )
      recentSourcePaths = []
      pathDraft = sourcePaths.joined(separator: "\n")
      return
    }

    sourcePaths = Self.stringArray(forKey: DefaultsKeys.sourcePaths)
    recentSourcePaths = Self.stringArray(forKey: DefaultsKeys.recentSourcePaths)
    pathDraft = sourcePaths.joined(separator: "\n")
    exportDirectoryPath = UserDefaults.standard.string(forKey: DefaultsKeys.exportDirectoryPath) ?? ""
    hasSinceFilter = UserDefaults.standard.bool(forKey: DefaultsKeys.hasSinceFilter)
    hasUntilFilter = UserDefaults.standard.bool(forKey: DefaultsKeys.hasUntilFilter)
    if let savedSinceDate = Self.date(forKey: DefaultsKeys.sinceDate) {
      sinceDate = savedSinceDate
    }
    if let savedUntilDate = Self.date(forKey: DefaultsKeys.untilDate) {
      untilDate = savedUntilDate
    }
    if let savedAnchorDate = Self.date(forKey: DefaultsKeys.dateAnchorDate) {
      dateAnchorDate = savedAnchorDate
    } else {
      dateAnchorDate = untilDate
    }
    if let savedMode = UserDefaults.standard.string(forKey: DefaultsKeys.dateRangeMode),
      let mode = DateRangeMode(rawValue: savedMode) {
      dateRangeMode = mode
      applyDateRangeMode(save: false, reload: false)
    } else if hasSinceFilter || hasUntilFilter {
      dateRangeMode = .custom
      applyDateRangeMode(save: false, reload: false)
    }
    if let savedProjectSort = UserDefaults.standard.string(forKey: DefaultsKeys.projectSortOption),
      let sortOption = ProjectSortOption(rawValue: savedProjectSort) {
      projectSortOption = sortOption
    }
    let savedHiddenOperationalCategories = Set(Self.stringArray(forKey: DefaultsKeys.hiddenOperationalMessageCategories))
    let savedOperationalCategoryVersion = UserDefaults.standard.integer(
      forKey: DefaultsKeys.operationalMessageCategoriesVersion
    )
    if savedHiddenOperationalCategories.isEmpty,
      UserDefaults.standard.object(forKey: DefaultsKeys.showOperationalMessages) != nil,
      !UserDefaults.standard.bool(forKey: DefaultsKeys.showOperationalMessages) {
      hiddenOperationalMessageCategories = Self.operationalPromptCategorySet
    } else {
      hiddenOperationalMessageCategories = Self.migratedOperationalCategories(
        savedHiddenOperationalCategories,
        settingsVersion: savedOperationalCategoryVersion
      )
    }
    hiddenRepeatedPromptCategories = Self.migratedRepeatedPromptCategories(
      Set(Self.stringArray(forKey: DefaultsKeys.hiddenRepeatedPromptCategories)),
      settingsVersion: savedOperationalCategoryVersion
    )
    showSessionBrowser = UserDefaults.standard.bool(forKey: DefaultsKeys.showSessionBrowser)
    if savedOperationalCategoryVersion < Self.operationalMessageCategoriesVersion {
      saveSettings()
    }
  }

  private func saveSettings() {
    if isEphemeralSettingsRun {
      return
    }
    UserDefaults.standard.set(sourcePaths, forKey: DefaultsKeys.sourcePaths)
    UserDefaults.standard.set(recentSourcePaths, forKey: DefaultsKeys.recentSourcePaths)
    UserDefaults.standard.set(exportDirectoryPath, forKey: DefaultsKeys.exportDirectoryPath)
    UserDefaults.standard.set(hasSinceFilter, forKey: DefaultsKeys.hasSinceFilter)
    UserDefaults.standard.set(hasUntilFilter, forKey: DefaultsKeys.hasUntilFilter)
    UserDefaults.standard.set(Self.dateFormatter.string(from: sinceDate), forKey: DefaultsKeys.sinceDate)
    UserDefaults.standard.set(Self.dateFormatter.string(from: untilDate), forKey: DefaultsKeys.untilDate)
    UserDefaults.standard.set(dateRangeMode.rawValue, forKey: DefaultsKeys.dateRangeMode)
    UserDefaults.standard.set(Self.dateFormatter.string(from: dateAnchorDate), forKey: DefaultsKeys.dateAnchorDate)
    UserDefaults.standard.set(projectSortOption.rawValue, forKey: DefaultsKeys.projectSortOption)
    UserDefaults.standard.set(Array(hiddenOperationalMessageCategories).sorted(), forKey: DefaultsKeys.hiddenOperationalMessageCategories)
    UserDefaults.standard.set(Self.operationalMessageCategoriesVersion, forKey: DefaultsKeys.operationalMessageCategoriesVersion)
    UserDefaults.standard.removeObject(forKey: DefaultsKeys.showOperationalMessages)
    UserDefaults.standard.set(Array(hiddenRepeatedPromptCategories).sorted(), forKey: DefaultsKeys.hiddenRepeatedPromptCategories)
    UserDefaults.standard.set(showSessionBrowser, forKey: DefaultsKeys.showSessionBrowser)
  }

  private func applyDateRangeMode(save: Bool = true, reload: Bool = true) {
    let calendar = Calendar.current
    dateAnchorDate = Self.clampedToToday(dateAnchorDate, calendar: calendar)
    sinceDate = Self.clampedToToday(sinceDate, calendar: calendar)
    untilDate = Self.clampedToToday(untilDate, calendar: calendar)

    switch dateRangeMode {
    case .all:
      hasSinceFilter = false
      hasUntilFilter = false
    case .day:
      hasSinceFilter = true
      hasUntilFilter = true
      sinceDate = dateAnchorDate
      untilDate = dateAnchorDate
    case .week:
      applyInterval(calendar.dateInterval(of: .weekOfYear, for: dateAnchorDate))
    case .month:
      applyInterval(calendar.dateInterval(of: .month, for: dateAnchorDate))
    case .year:
      applyInterval(calendar.dateInterval(of: .year, for: dateAnchorDate))
    case .custom:
      hasSinceFilter = true
      hasUntilFilter = true
      sinceDate = calendar.startOfDay(for: sinceDate)
      untilDate = calendar.startOfDay(for: untilDate)
      if sinceDate > untilDate {
        untilDate = sinceDate
      }
      dateAnchorDate = untilDate
    }

    if save {
      saveSettings()
    }
    if reload {
      clearAuditPreview()
      clearSelectionState()
      refresh()
    }
  }

  private func applyInterval(_ interval: DateInterval?) {
    let calendar = Calendar.current
    let interval = interval ?? DateInterval(start: dateAnchorDate, duration: 86_400)
    let today = Self.startOfToday(calendar: calendar)
    hasSinceFilter = true
    hasUntilFilter = true
    sinceDate = calendar.startOfDay(for: interval.start)
    let intervalEndDate = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? sinceDate
    untilDate = min(calendar.startOfDay(for: intervalEndDate), today)
    if sinceDate > untilDate {
      sinceDate = untilDate
    }
  }

  private func scheduleUITestWorkflowIfNeeded(api: LogEngineAPI, filters: LogFilters) {
    guard ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_TEST_AUTO_QUIT"] == "1" ||
      ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_WORKFLOW_SMOKE"] == "1",
      !hasScheduledUITestQuit
    else {
      return
    }

    hasScheduledUITestQuit = true
    if ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_WORKFLOW_SMOKE"] == "1" {
      Task {
        do {
          try await Task.sleep(for: .seconds(10))
          try await runUITestWorkflow(api: api, filters: filters)
          Self.writeStdout("Native UI workflow smoke passed.\n")
          LocalLogEngineServer.shared.stop()
          NSApp.terminate(nil)
        } catch {
          Self.writeStderr("Native UI workflow smoke failed: \(error.localizedDescription)\n")
          LocalLogEngineServer.shared.stop()
          exit(1)
        }
      }
      return
    }

    Task {
      try? await Task.sleep(for: .seconds(8))
      NSApp.terminate(nil)
    }
  }

  private func runUITestWorkflow(api: LogEngineAPI, filters: LogFilters) async throws {
    let projects = try await api.projects(filters: filters)
    guard projects.contains(where: { $0.project == "sample-app" }) else {
      throw AppSmokeError.unexpected("The sanitized fixture project was not visible in the project list.")
    }
    self.projects = projects

    let fixtureDate = "2026-04-27"
    guard let date = Self.dateFormatter.date(from: fixtureDate) else {
      throw AppSmokeError.unexpected("The UI workflow fixture date could not be parsed.")
    }
    hasSinceFilter = true
    hasUntilFilter = true
    sinceDate = date
    untilDate = date
    dateRangeMode = .day
    dateAnchorDate = date

    let dateFilters = LogFilters(
      paths: filters.paths,
      since: fixtureDate,
      until: fixtureDate,
      refreshToken: filters.refreshToken
    )
    let allProjectsSummary = try await api.summary(project: AppConstants.allProjectsName, filters: dateFilters)
    guard allProjectsSummary.sessions.contains(where: { $0.project == "sample-app" }) else {
      throw AppSmokeError.unexpected("The sanitized fixture session was not visible in all-projects summary.")
    }

    selectedProject = "sample-app"
    let projectSummary = try await api.summary(project: selectedProject, filters: dateFilters)
    guard projectSummary.totals.userMessages == 1,
      projectSummary.sessions.first?.sessionId == "sample-session-1"
    else {
      throw AppSmokeError.unexpected("The sample project summary did not match the sanitized fixture.")
    }
    guard projectSummary.promptIntents.totalMessages == 1,
      projectSummary.promptIntents.buckets.first?.label == "Testing/verification",
      projectSummary.promptIntents.buckets.first?.count == 1
    else {
      throw AppSmokeError.unexpected("The sample project focus summary did not classify the fixture prompt.")
    }
    summary = projectSummary
    selectedSection = .overview
    let previousOverviewHiddenCategories = hiddenOperationalMessageCategories
    hiddenOperationalMessageCategories = ["Testing/verification"]
    let filteredProjectFocus = visiblePromptIntentSummary(projectSummary.promptIntents)
    guard filteredProjectFocus.totalMessages == 0,
      filteredProjectFocus.buckets.isEmpty
    else {
      throw AppSmokeError.unexpected("The overview Project Focus summary did not honor hidden operational categories.")
    }
    hiddenOperationalMessageCategories = previousOverviewHiddenCategories

    messageQuery = "parser test"
    messageRoleFilter = .all
    messageModelFilter = AppConstants.allModelsName
    messageSessionFilter = nil
    messageSessionFilePathFilter = nil
    let search = try await api.searchMessages(
      query: messageQuery,
      role: messageRoleFilter,
      model: messageModelFilter,
      sessionID: nil,
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    guard let result = search.results.first, search.totalMatches >= 1 else {
      throw AppSmokeError.unexpected("The UI workflow message search returned no fixture matches.")
    }
    searchSummary = search
    selectedSearchResultID = result.id
    selectedSessionID = sessionSelectionID(
      sessionID: result.sessionId,
      filePath: result.filePath,
      dateKey: result.dateKey
    ) ?? result.sessionId

    let sentMessagesSearch = try await api.searchMessages(
      query: "",
      role: .user,
      model: AppConstants.allModelsName,
      sessionID: nil,
      project: selectedProject,
      filters: dateFilters,
      submittedOnly: true
    )
    guard sentMessagesSearch.totalMatches == 1,
      sentMessagesSearch.results.first?.role == MessageRoleFilter.user.rawValue,
      sentMessagesSearch.results.first?.category == "Testing/verification",
      sentMessagesSearch.results.first?.promptIntent == "Testing/verification",
      sentMessagesSearch.results.first?.snippet.contains("parser test") == true
    else {
      throw AppSmokeError.unexpected("The UI workflow sent-messages search did not return the fixture prompt.")
    }
    let hiddenOperationalSearch = try await api.searchMessages(
      query: "",
      role: .user,
      model: AppConstants.allModelsName,
      sessionID: nil,
      project: selectedProject,
      filters: dateFilters,
      submittedOnly: true,
      hiddenCategories: Self.operationalPromptCategoryOrder
    )
    guard hiddenOperationalSearch.totalMatches == 0 else {
      throw AppSmokeError.unexpected("The UI workflow operational-message filter did not hide all fixture prompts.")
    }
    browseMessagesSummary = sentMessagesSearch
    let previousHiddenOperationalCategories = hiddenOperationalMessageCategories
    hiddenOperationalMessageCategories = ["Testing/verification"]
    guard areBrowseMessagesHiddenByOperationalFilters, browseMessages.isEmpty else {
      throw AppSmokeError.unexpected("The project browse empty state did not detect operationally hidden messages.")
    }
    hiddenOperationalMessageCategories = previousHiddenOperationalCategories

    copySearchResultSessionID(result)
    guard Self.pasteboardText() == result.sessionId else {
      throw AppSmokeError.unexpected("The search result session copy action did not update the pasteboard.")
    }
    copySearchResultProject(result)
    guard Self.pasteboardText() == result.project else {
      throw AppSmokeError.unexpected("The search result project copy action did not update the pasteboard.")
    }
    copySearchResultSnippet(result)
    guard let copiedSnippet = Self.pasteboardText(),
      copiedSnippet.contains("parser test"),
      !copiedSnippet.contains("/Users/example")
    else {
      throw AppSmokeError.unexpected("The search result snippet copy action did not write a sanitized snippet.")
    }

    let detail = try await api.sessionDetail(
      sessionID: result.sessionId,
      filePath: result.filePath,
      dateKey: result.dateKey,
      project: selectedProject,
      filters: dateFilters
    )
    guard detail.messages.contains(where: { $0.content.contains("parser test") }) else {
      throw AppSmokeError.unexpected("The selected search result did not load full session context.")
    }
    guard detail.messages.first(where: { $0.content.contains("parser test") })?.promptIntent == "Testing/verification" else {
      throw AppSmokeError.unexpected("The selected session detail did not expose prompt intent labels.")
    }
    guard let firstUserMessage = SessionInteractionBuilder.userMessageOffsets(in: detail).first,
      let interaction = SessionInteractionBuilder.interaction(
        in: detail,
        selectedUserMessageIndex: firstUserMessage.offset
      ),
      !interaction.assistantMessages.isEmpty
    else {
      throw AppSmokeError.unexpected("The selected user message did not reconstruct its Codex response.")
    }
    let assistantSearch = try await api.searchMessages(
      query: "parser test fixture",
      role: .assistant,
      model: AppConstants.allModelsName,
      sessionID: result.sessionId,
      filePath: result.filePath,
      project: selectedProject,
      filters: dateFilters
    )
    guard let assistantResult = assistantSearch.results.first,
      userMessageIndex(for: SearchResultSelectionTarget(assistantResult), in: detail) == firstUserMessage.offset
    else {
      throw AppSmokeError.unexpected("Assistant search results did not map back to their user-message interaction.")
    }
    browseMessagesSummary = sentMessagesSearch
    pendingSearchResultTarget = SearchResultSelectionTarget(assistantResult)
    selectedUserMessageIndex = nil
    applyPendingMessageSelection(to: detail)
    guard selectedUserMessageIndex == firstUserMessage.offset,
      selectedBrowseMessageID == sentMessagesSearch.results.first?.id
    else {
      throw AppSmokeError.unexpected("Search result conversation navigation did not sync the highlighted user message.")
    }
    selectedSessionDetail = detail

    messageSessionFilter = result.sessionId
    messageSessionFilePathFilter = result.filePath
    messageSessionDateKeyFilter = result.dateKey
    let sessionSearch = try await api.searchMessages(
      query: messageQuery,
      role: .all,
      model: AppConstants.allModelsName,
      sessionID: result.sessionId,
      filePath: result.filePath,
      dateKey: result.dateKey,
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    guard sessionSearch.totalMatches >= 1 else {
      throw AppSmokeError.unexpected("The selected-session message filter returned no fixture matches.")
    }

    let evals = try await api.evalMessagesWithMetadata(
      query: "parser test",
      categoryKey: nil,
      reviewState: .all,
      project: AppConstants.allProjectsName,
      filters: LogFilters(paths: filters.paths)
    )
    guard let evalMessage = evals.evals.results.first,
      evalMessage.promptIntent == "Testing/verification",
      evalMessage.ruleKey == "testing-verification"
    else {
      throw AppSmokeError.unexpected("The Evals workflow did not expose the fixture prompt classification.")
    }
    let review = try await api.saveEvalReview(
      evalId: evalMessage.evalId,
      actualKey: evalMessage.promptIntentKey,
      expectedKey: evalMessage.promptIntentKey,
      note: nil
    )
    guard review.isCorrect else {
      throw AppSmokeError.unexpected("The Evals workflow did not save a correct review.")
    }
    let reviewedEvals = try await api.evalMessagesWithMetadata(
      query: "parser test",
      categoryKey: nil,
      reviewState: .correct,
      project: AppConstants.allProjectsName,
      filters: LogFilters(paths: filters.paths)
    )
    guard reviewedEvals.evals.totalMatches == 1,
      reviewedEvals.evals.summary.reviewedMessages == 1,
      reviewedEvals.evals.summary.correctMessages == 1
    else {
      throw AppSmokeError.unexpected("The Evals workflow did not update reviewed counts.")
    }
    try await api.deleteEvalReview(evalId: evalMessage.evalId)
    let clearedEvals = try await api.evalMessagesWithMetadata(
      query: "parser test",
      categoryKey: nil,
      reviewState: .unreviewed,
      project: AppConstants.allProjectsName,
      filters: LogFilters(paths: filters.paths)
    )
    guard clearedEvals.evals.totalMatches == 1 else {
      throw AppSmokeError.unexpected("The Evals workflow did not clear the review.")
    }

    let jsonExport = try await api.exportSummary(
      format: .json,
      project: selectedProject,
      filters: dateFilters
    )
    let csvExport = try await api.exportSummary(
      format: .csv,
      project: selectedProject,
      filters: dateFilters
    )
    let jsonText = String(data: jsonExport, encoding: .utf8) ?? ""
    let csvText = String(data: csvExport, encoding: .utf8) ?? ""
    guard jsonText.contains("[redacted]"),
      jsonText.contains(#""project": "sample-app""#),
      !jsonText.contains("/Users/example"),
      csvText.contains("project,sample-app"),
      csvText.contains("user_messages")
    else {
      throw AppSmokeError.unexpected("The UI workflow export checks did not pass.")
    }

    let previousExportDirectoryPath = exportDirectoryPath
    if let fixturePath = filters.paths.first {
      let fixtureDirectory = URL(fileURLWithPath: fixturePath).deletingLastPathComponent()
      exportDirectoryPath = fixtureDirectory.path
      guard defaultExportDirectoryURL().standardizedFileURL.path != fixtureDirectory.standardizedFileURL.path else {
        throw AppSmokeError.unexpected("The export destination fallback still points at the selected log source.")
      }
    }
    exportDirectoryPath = previousExportDirectoryPath

    let previousAuditRepoPath = auditRepoPathDraft
    setAuditRepoPathDraft(FileManager.default.temporaryDirectory.appendingPathComponent("codex-log-viewer-audit-smoke").path)
    guard canGenerateAudit else {
      throw AppSmokeError.unexpected("Manual Audit repository path entry did not enable preview generation.")
    }
    auditRepoPathDraft = previousAuditRepoPath
    clearAuditPreview()
  }

  private func currentFilters(refreshToken: Int = 0, rebuildCache: Bool = false) -> LogFilters {
    LogFilters(
      paths: sourcePaths,
      since: hasSinceFilter ? Self.dateFormatter.string(from: sinceDate) : nil,
      until: hasUntilFilter ? Self.dateFormatter.string(from: untilDate) : nil,
      refreshToken: refreshToken,
      rebuildCache: rebuildCache
    )
  }

  private func defaultExportDirectoryURL() -> URL {
    let savedURL = URL(fileURLWithPath: exportDirectoryPath, isDirectory: true)
    if !exportDirectoryPath.isEmpty,
      directoryExists(savedURL),
      isSafeExportDirectory(savedURL) {
      return savedURL
    }

    if let downloadsURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first,
      directoryExists(downloadsURL),
      isSafeExportDirectory(downloadsURL) {
      return downloadsURL
    }

    return FileManager.default.homeDirectoryForCurrentUser
  }

  private func rememberExportDirectory(_ url: URL) {
    let directoryURL = url.standardizedFileURL
    exportDirectoryPath = directoryURL.path
    guard !isEphemeralSettingsRun else { return }
    UserDefaults.standard.set(exportDirectoryPath, forKey: DefaultsKeys.exportDirectoryPath)
  }

  private func directoryExists(_ url: URL) -> Bool {
    var isDirectory: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) && isDirectory.boolValue
  }

  private func isSafeExportDirectory(_ url: URL) -> Bool {
    let exportPath = Self.normalizedDirectoryPath(url.path)
    guard !exportPath.isEmpty else { return false }
    return !sourcePaths.contains { sourcePath in
      let sourceURL = URL(fileURLWithPath: sourcePath)
      let sourceDirectoryPath: String
      if directoryExists(sourceURL) {
        sourceDirectoryPath = Self.normalizedDirectoryPath(sourceURL.path)
      } else {
        sourceDirectoryPath = Self.normalizedDirectoryPath(sourceURL.deletingLastPathComponent().path)
      }
      guard !sourceDirectoryPath.isEmpty else { return false }
      return exportPath == sourceDirectoryPath || exportPath.hasPrefix("\(sourceDirectoryPath)/")
    }
  }

  private static func normalizedDirectoryPath(_ path: String) -> String {
    let normalized = URL(fileURLWithPath: path, isDirectory: true).standardizedFileURL.path
    guard normalized.count > 1, normalized.hasSuffix("/") else {
      return normalized
    }
    return String(normalized.dropLast())
  }

  private func exportFilename(_ format: ExportFormat) -> String {
    let projectName = selectedProject
      .lowercased()
      .replacingOccurrences(of: #"[^a-z0-9-]+"#, with: "-", options: .regularExpression)
      .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    let safeName = projectName.isEmpty ? "all-projects" : projectName
    return "codex-log-viewer-\(safeName).\(format.fileExtension)"
  }

  private func confirmJsonExport() -> Bool {
    let alert = NSAlert()
    alert.messageText = "Export Redacted JSON?"
    alert.informativeText = "The default JSON export redacts local source paths and working directories. Review exports before sharing because project names, timestamps, session IDs, and usage metadata may still be sensitive."
    alert.alertStyle = .informational
    alert.addButton(withTitle: "Export")
    alert.addButton(withTitle: "Cancel")
    return alert.runModal() == .alertFirstButtonReturn
  }

  private func confirmEvalFixtureDraftExport() -> Bool {
    let alert = NSAlert()
    alert.messageText = "Export Evals Fixture Draft?"
    alert.informativeText = "The draft includes reviewed labels, but it does not include raw prompt text. Replace every placeholder with a sanitized synthetic prompt before copying examples into tracked fixtures."
    alert.alertStyle = .informational
    alert.addButton(withTitle: "Export Draft")
    alert.addButton(withTitle: "Cancel")
    return alert.runModal() == .alertFirstButtonReturn
  }

  private static let dateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()

  private static let displayDateTimeFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter
  }()

  private static let displayDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter
  }()

  private static let displayMonthFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "LLLL yyyy"
    return formatter
  }()

  private static let displayYearFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy"
    return formatter
  }()

  private static func displayDateOnly(_ date: Date) -> String {
    displayDateFormatter.string(from: date)
  }

  private static func displayDateKey(_ value: String) -> String? {
    dateFormatter.date(from: value).map(displayDateOnly)
  }

  private static func displayMonth(_ date: Date) -> String {
    displayMonthFormatter.string(from: date)
  }

  private static func displayYear(_ date: Date) -> String {
    displayYearFormatter.string(from: date)
  }

  private static func startOfToday(calendar: Calendar = .current) -> Date {
    calendar.startOfDay(for: Date())
  }

  private static func clampedToToday(_ date: Date, calendar: Calendar = .current) -> Date {
    min(calendar.startOfDay(for: date), startOfToday(calendar: calendar))
  }

  private static func displayDateTime(_ value: String?) -> String? {
    guard let value,
      let date = Self.isoDateFormatter.date(from: value) ?? Self.isoDateFormatterWithoutFractionalSeconds.date(from: value)
    else {
      return nil
    }
    return Self.displayDateTimeFormatter.string(from: date)
  }

  private static let isoDateFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private static let isoDateFormatterWithoutFractionalSeconds: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  private static func stringArray(forKey key: String) -> [String] {
    UserDefaults.standard.stringArray(forKey: key) ?? []
  }

  private static func date(forKey key: String) -> Date? {
    guard let value = UserDefaults.standard.string(forKey: key) else {
      return nil
    }
    return dateFormatter.date(from: value)
  }

  private func copyTextToPasteboard(_ value: String) {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(value, forType: .string)
  }

  private static func pasteboardText() -> String? {
    NSPasteboard.general.string(forType: .string)
  }

  private static func sanitizedClipboardSnippet(_ value: String) -> String {
    value
      .replacingOccurrences(of: NSHomeDirectory(), with: "~")
      .replacingOccurrences(of: #"/Users/[^/\s]+/"#, with: "~/", options: .regularExpression)
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static let operationalPromptCategoryOrder = [
    "Code review/QA",
    "Deploy/release/run/build",
    "Git commands",
    "Plan approvals",
    "Testing/verification"
  ]
  private static let operationalPromptCategorySet = Set(operationalPromptCategoryOrder)
  private static let legacyOperationalPromptCategorySet: Set<String> = [
    "Code review",
    "Git commands",
    "Plan approvals",
    "Run app"
  ]
  private static let operationalMessageCategoriesVersion = 3

  private static func migratedOperationalCategories(
    _ categories: Set<String>,
    settingsVersion: Int
  ) -> Set<String> {
    migratedCategoryLabels(categories, settingsVersion: settingsVersion)
      .intersection(operationalPromptCategorySet)
  }

  private static func migratedRepeatedPromptCategories(
    _ categories: Set<String>,
    settingsVersion: Int
  ) -> Set<String> {
    migratedCategoryLabels(categories, settingsVersion: settingsVersion)
  }

  private static func migratedCategoryLabels(
    _ categories: Set<String>,
    settingsVersion: Int
  ) -> Set<String> {
    guard settingsVersion < operationalMessageCategoriesVersion else {
      return categories
    }

    var migrated = categories
    if migrated.remove("Deploy/release") != nil {
      migrated.insert("Deploy/release/run/build")
    }
    if migrated.remove("Code review") != nil {
      migrated.insert("Code review/QA")
    }
    if migrated.remove("Run app") != nil {
      migrated.insert("Deploy/release/run/build")
    }
    if migrated.remove("Run/build app") != nil {
      migrated.insert("Deploy/release/run/build")
    }
    if categories.contains("Git commands") {
      migrated.insert("Deploy/release/run/build")
    }
    if legacyOperationalPromptCategorySet.isSubset(of: categories) {
      migrated.formUnion(operationalPromptCategorySet)
    }
    return migrated
  }

  private static func writeStdout(_ message: String) {
    FileHandle.standardOutput.write(Data(message.utf8))
  }

  private static func writeStderr(_ message: String) {
    FileHandle.standardError.write(Data(message.utf8))
  }

  static func showAboutBox() {
    let credits = NSAttributedString(
      string: "A local-first native macOS viewer for Codex session logs.\n\nCodex logs stay on this Mac unless you explicitly export data.",
      attributes: [
        .font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize),
        .foregroundColor: NSColor.secondaryLabelColor
      ]
    )
    NSApp.orderFrontStandardAboutPanel(options: [
      .applicationName: "Codex Log Viewer",
      .applicationVersion: AppVersion.marketingVersion,
      .version: AppVersion.displayVersion,
      .credits: credits
    ])
    NSApp.activate(ignoringOtherApps: true)
  }

  static func showHelpBox() {
    let alert = NSAlert()
    alert.messageText = "Codex Log Viewer Help"
    alert.informativeText = """
    Browse
    Choose a project, pick a submitted message, and read the matching Codex interaction.

    Overview
    Project Focus shows the main types of work in the current project and date range.

    Filters
    Use the date control in the header. In View > Operational Messages, open the checklist to show or hide approvals, Git, deploy/release/run/build, testing, and review prompts. Use View > Show Sessions only when you need the session column.

    Search and Audit
    Search finds messages across the current filters. Audit prepares a reviewed AI worklog for the selected repository.

    Logs
    Use Logs > Choose Codex Log Location to change sources. Exports are redacted by default, but still review them before sharing. Your Codex logs stay on this Mac unless you export them.
    """
    alert.alertStyle = .informational
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Open Usage Guide")
    if alert.runModal() == .alertSecondButtonReturn {
      Self.openUsageGuide()
    } else {
      Self.restoreViewerWindow(activate: true)
    }
  }

  static func openUsageGuide() {
    let usageGuideURL = Self.localUsageGuideURL() ??
      URL(string: "https://github.com/crispierry/codex-log-viewer/blob/main/docs/usage.md")

    if let usageGuideURL {
      NSWorkspace.shared.open(usageGuideURL)
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
      Self.restoreViewerWindow(activate: false)
    }
  }

  static func restoreViewerWindow(activate: Bool) {
    if let appDelegate = NSApp.delegate as? AppDelegate {
      appDelegate.ensureViewerWindowVisible(activate: activate)
    } else if let window = NSApp.windows.first {
      window.makeKeyAndOrderFront(nil)
      if activate {
        NSApp.activate(ignoringOtherApps: true)
      }
    }
  }

  private static func localUsageGuideURL() -> URL? {
    let fileManager = FileManager.default
    let seeds = [
      URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true),
      Bundle.main.bundleURL,
      Bundle.main.executableURL?.deletingLastPathComponent()
    ].compactMap { $0 }

    for seed in seeds {
      var directory = seed.standardizedFileURL
      for _ in 0..<8 {
        let candidate = directory.appendingPathComponent("docs").appendingPathComponent("usage.md")
        if fileManager.fileExists(atPath: candidate.path) {
          return candidate
        }

        let parent = directory.deletingLastPathComponent()
        if parent.path == directory.path {
          break
        }
        directory = parent
      }
    }

    return nil
  }
}

private struct SearchResultSelectionTarget {
  let lineNumber: Int?
  let turnId: String?
  let role: String
  let sourceEvent: String

  init(_ result: MessageSearchResult) {
    lineNumber = result.lineNumber
    turnId = result.turnId
    role = result.role
    sourceEvent = result.sourceEvent
  }
}

private enum DefaultsKeys {
  static let sourcePaths = "sourcePaths"
  static let recentSourcePaths = "recentSourcePaths"
  static let exportDirectoryPath = "exportDirectoryPath"
  static let hasSinceFilter = "hasSinceFilter"
  static let hasUntilFilter = "hasUntilFilter"
  static let sinceDate = "sinceDate"
  static let untilDate = "untilDate"
  static let dateRangeMode = "dateRangeMode"
  static let dateAnchorDate = "dateAnchorDate"
  static let projectSortOption = "projectSortOption"
  static let showOperationalMessages = "showOperationalMessages"
  static let hiddenOperationalMessageCategories = "hiddenOperationalMessageCategories"
  static let operationalMessageCategoriesVersion = "operationalMessageCategoriesVersion"
  static let hiddenRepeatedPromptCategories = "hiddenRepeatedPromptCategories"
  static let showSessionBrowser = "showSessionBrowser"
}
