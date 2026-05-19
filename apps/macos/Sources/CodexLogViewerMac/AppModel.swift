import AppKit
import Darwin
import Foundation

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
  @Published var sessionQuery = ""
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
  @Published var messageSearchFocusRequest = 0
  @Published var cacheMetadata: CacheMetadata?

  private var api: LogEngineAPI?
  private var hasStarted = false
  private var refreshToken = 0
  private var reloadTask: Task<Void, Never>?
  private var detailTask: Task<Void, Never>?
  private var searchTask: Task<Void, Never>?
  private var reloadRequestID = 0
  private var detailRequestID = 0
  private var searchRequestID = 0
  private var pendingSearchResultTarget: SearchResultSelectionTarget?
  private let isEphemeralSettingsRun = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_EPHEMERAL_SETTINGS"] == "1" ||
    ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_TEST"] == "1"
  private var hasScheduledUITestQuit = false

  init() {
    loadSettings()
  }

  var filteredSessions: [SessionSummary] {
    let sessions = summary?.sessions ?? []
    let query = sessionQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !query.isEmpty else { return sessions }

    return sessions.filter { session in
      [
        session.sessionId,
        session.project,
        session.cwd,
        session.filePath,
        session.dateKey,
        session.models.joined(separator: " ")
      ]
      .compactMap { $0 }
      .joined(separator: " ")
      .lowercased()
      .contains(query)
    }
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
        let connection = try await LocalLogEngineServer.shared.start()
        api = LogEngineAPI(baseURL: connection.baseURL, authToken: connection.authToken)
        refresh()
      } catch {
        status = .failed(error.localizedDescription)
      }
    }
  }

  var cacheStatusText: String? {
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

  func refresh(force: Bool = false, rebuildCache: Bool = false) {
    guard let api else { return }
    let shouldRefreshCache = force || rebuildCache
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

    reloadTask = Task {
      do {
        status = .loading
        async let projectList = api.projectsWithMetadata(filters: filters)
        async let projectSummary = api.summaryWithMetadata(project: project, filters: filters)
        let (projectsResult, summaryResult) = try await (projectList, projectSummary)
        guard !Task.isCancelled, requestID == reloadRequestID else { return }
        self.projects = projectsResult.projects
        self.summary = summaryResult.summary
        self.cacheMetadata = summaryResult.cache ?? projectsResult.cache
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
        selectLatestSessionIfNeeded(in: summary)
        status = .ready
        scheduleUITestWorkflowIfNeeded(api: api, filters: filters)
      } catch is CancellationError {
        return
      } catch {
        guard requestID == reloadRequestID else { return }
        status = .failed(error.localizedDescription)
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

  func selectProject(_ project: String) {
    selectedProject = project
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

  func setDateAnchorDate(_ date: Date) {
    dateAnchorDate = Calendar.current.startOfDay(for: date)
    guard dateRangeMode != .all, dateRangeMode != .custom else {
      saveSettings()
      return
    }
    applyDateRangeMode()
  }

  func setCustomSinceDate(_ date: Date) {
    dateRangeMode = .custom
    sinceDate = Calendar.current.startOfDay(for: date)
    if untilDate < sinceDate {
      untilDate = sinceDate
    }
    applyDateRangeMode()
  }

  func setCustomUntilDate(_ date: Date) {
    dateRangeMode = .custom
    untilDate = Calendar.current.startOfDay(for: date)
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

  func selectSession(_ sessionID: SessionSummary.ID?) {
    selectedSessionID = sessionID
    selectedUserMessageIndex = nil
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

  func searchMessages() {
    selectedSection = .search
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
          submittedOnly: submittedOnly
        )
        guard !Task.isCancelled, requestID == searchRequestID else { return }
        searchSummary = searchResult.search
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
    searchMessages()
  }

  func focusMessageSearch() {
    selectedSection = .search
    messageSearchFocusRequest += 1
  }

  func selectSearchResult(_ resultID: MessageSearchResult.ID?) {
    selectedSearchResultID = resultID
    guard let resultID,
      let result = searchSummary?.results.first(where: { $0.id == resultID })
    else {
      return
    }
    selectedSection = .browse
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
        status = .ready
      } catch {
        status = .failed(error.localizedDescription)
      }
    }
  }

  private func clearSelectionState() {
    clearSelectedSession()
    clearSearchResults()
  }

  private func clearSelectedSession() {
    detailTask?.cancel()
    detailRequestID += 1
    selectedSessionID = nil
    selectedSessionDetail = nil
    selectedUserMessageIndex = nil
    pendingSearchResultTarget = nil
    isDetailLoading = false
    sessionQuery = ""
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

  private func detailTarget(for selectionID: SessionSummary.ID) -> (sessionID: String, filePath: String?, dateKey: String?) {
    if let session = sessionForSelectionID(selectionID) {
      return (session.sessionId, session.filePath, session.dateKey)
    }
    if let selectedSearchResultID,
      let result = searchSummary?.results.first(where: { $0.id == selectedSearchResultID && $0.sessionId == selectionID })
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
      let userMessageOffsets = SessionInteractionBuilder.userMessageOffsets(in: detail, dateKey: selectedSessionDateKey)
      if let selectedUserMessageIndex,
        userMessageOffsets.contains(where: { $0.offset == selectedUserMessageIndex }) {
        return
      }
      selectedUserMessageIndex = userMessageOffsets.last?.offset
      return
    }
    selectedUserMessageIndex = userMessageIndex(for: pendingSearchResultTarget, in: detail)
    self.pendingSearchResultTarget = nil
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
  }

  private func saveSettings() {
    if isEphemeralSettingsRun {
      return
    }
    UserDefaults.standard.set(sourcePaths, forKey: DefaultsKeys.sourcePaths)
    UserDefaults.standard.set(recentSourcePaths, forKey: DefaultsKeys.recentSourcePaths)
    UserDefaults.standard.set(hasSinceFilter, forKey: DefaultsKeys.hasSinceFilter)
    UserDefaults.standard.set(hasUntilFilter, forKey: DefaultsKeys.hasUntilFilter)
    UserDefaults.standard.set(Self.dateFormatter.string(from: sinceDate), forKey: DefaultsKeys.sinceDate)
    UserDefaults.standard.set(Self.dateFormatter.string(from: untilDate), forKey: DefaultsKeys.untilDate)
    UserDefaults.standard.set(dateRangeMode.rawValue, forKey: DefaultsKeys.dateRangeMode)
    UserDefaults.standard.set(Self.dateFormatter.string(from: dateAnchorDate), forKey: DefaultsKeys.dateAnchorDate)
    UserDefaults.standard.set(projectSortOption.rawValue, forKey: DefaultsKeys.projectSortOption)
  }

  private func applyDateRangeMode(save: Bool = true, reload: Bool = true) {
    let calendar = Calendar.current
    dateAnchorDate = calendar.startOfDay(for: dateAnchorDate)

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
      clearSelectionState()
      refresh()
    }
  }

  private func applyInterval(_ interval: DateInterval?) {
    let calendar = Calendar.current
    let interval = interval ?? DateInterval(start: dateAnchorDate, duration: 86_400)
    hasSinceFilter = true
    hasUntilFilter = true
    sinceDate = calendar.startOfDay(for: interval.start)
    untilDate = calendar.date(byAdding: .day, value: -1, to: interval.end) ?? sinceDate
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
    summary = projectSummary

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
      sentMessagesSearch.results.first?.snippet.contains("parser test") == true
    else {
      throw AppSmokeError.unexpected("The UI workflow sent-messages search did not return the fixture prompt.")
    }

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

  private static func writeStdout(_ message: String) {
    FileHandle.standardOutput.write(Data(message.utf8))
  }

  private static func writeStderr(_ message: String) {
    FileHandle.standardError.write(Data(message.utf8))
  }

  func showAboutBox() {
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
  static let hasSinceFilter = "hasSinceFilter"
  static let hasUntilFilter = "hasUntilFilter"
  static let sinceDate = "sinceDate"
  static let untilDate = "untilDate"
  static let dateRangeMode = "dateRangeMode"
  static let dateAnchorDate = "dateAnchorDate"
  static let projectSortOption = "projectSortOption"
}
