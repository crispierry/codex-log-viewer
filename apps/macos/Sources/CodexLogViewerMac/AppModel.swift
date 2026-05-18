import AppKit
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
        return "Scanning"
      case .failed:
        return "Needs Attention"
      }
    }
  }

  @Published var status: Status = .starting
  @Published var selectedProject = AppConstants.allProjectsName
  @Published var projects: [ProjectListItem] = []
  @Published var summary: ProjectSummary?
  @Published var selectedSessionID: SessionSummary.ID?
  @Published var selectedSessionDetail: SessionDetail?
  @Published var isDetailLoading = false
  @Published var sessionQuery = ""
  @Published var messageQuery = ""
  @Published var messageRoleFilter: MessageRoleFilter = .all
  @Published var messageModelFilter = AppConstants.allModelsName
  @Published var messageSessionFilter: String?
  @Published var searchSummary: MessageSearchSummary?
  @Published var selectedSearchResultID: MessageSearchResult.ID?
  @Published var pathDraft = ""
  @Published var sourcePaths: [String] = []
  @Published var recentSourcePaths: [String] = []
  @Published var hasSinceFilter = false
  @Published var hasUntilFilter = false
  @Published var sinceDate = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date()
  @Published var untilDate = Date()

  private var api: LogEngineAPI?
  private var hasStarted = false
  private var refreshToken = 0
  private var reloadTask: Task<Void, Never>?
  private var detailTask: Task<Void, Never>?
  private var searchTask: Task<Void, Never>?
  private var reloadRequestID = 0
  private var detailRequestID = 0
  private var searchRequestID = 0
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
        session.models.joined(separator: " ")
      ]
      .compactMap { $0 }
      .joined(separator: " ")
      .lowercased()
      .contains(query)
    }
  }

  var messageModelOptions: [String] {
    let models = summary?.models.map(\.model).filter { !$0.isEmpty } ?? []
    return [AppConstants.allModelsName] + models
  }

  var messageSessionFilterLabel: String? {
    guard let messageSessionFilter else { return nil }
    return String(messageSessionFilter.prefix(8))
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

  func refresh(force: Bool = false) {
    guard let api else { return }
    if force {
      refreshToken += 1
    }

    reloadTask?.cancel()
    reloadRequestID += 1
    let requestID = reloadRequestID
    let filters = currentFilters()
    let project = selectedProject

    reloadTask = Task {
      do {
        status = .loading
        async let projectList = api.projects(filters: filters)
        async let projectSummary = api.summary(project: project, filters: filters)
        let (projects, summary) = try await (projectList, projectSummary)
        guard !Task.isCancelled, requestID == reloadRequestID else { return }
        self.projects = projects
        self.summary = summary
        if messageModelFilter != AppConstants.allModelsName,
          !summary.models.contains(where: { $0.model == messageModelFilter }) {
          messageModelFilter = AppConstants.allModelsName
        }
        if let messageSessionFilter, !summary.sessions.contains(where: { $0.id == messageSessionFilter }) {
          self.messageSessionFilter = nil
        }
        if let selectedSessionID, !summary.sessions.contains(where: { $0.id == selectedSessionID }) {
          clearSelectedSession()
        }
        status = .ready
        scheduleUITestQuitIfNeeded()
      } catch is CancellationError {
        return
      } catch {
        guard requestID == reloadRequestID else { return }
        status = .failed(error.localizedDescription)
      }
    }
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
    clearSelectionState()
    refresh()
  }

  func selectSession(_ sessionID: SessionSummary.ID?) {
    selectedSessionID = sessionID
    if !selectedSearchResultBelongsToSession(sessionID) {
      selectedSearchResultID = nil
    }
    selectedSessionDetail = nil
    loadSelectedSession()
  }

  func loadSelectedSession() {
    guard let sessionID = selectedSessionID, let api else {
      selectedSessionDetail = nil
      isDetailLoading = false
      return
    }

    detailTask?.cancel()
    detailRequestID += 1
    let requestID = detailRequestID
    let filters = currentFilters()
    let project = selectedProject

    detailTask = Task {
      do {
        isDetailLoading = true
        let detail = try await api.sessionDetail(sessionID: sessionID, project: project, filters: filters)
        guard !Task.isCancelled, requestID == detailRequestID else { return }
        selectedSessionDetail = detail
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
    let trimmedQuery = messageQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty, let api else {
      clearSearchResults()
      return
    }

    searchTask?.cancel()
    searchRequestID += 1
    let requestID = searchRequestID
    let filters = currentFilters()
    let project = selectedProject
    let role = messageRoleFilter
    let model = messageModelFilter
    let sessionID = messageSessionFilter

    searchTask = Task {
      do {
        status = .loading
        let search = try await api.searchMessages(
          query: trimmedQuery,
          role: role,
          model: model,
          sessionID: sessionID,
          project: project,
          filters: filters
        )
        guard !Task.isCancelled, requestID == searchRequestID else { return }
        searchSummary = search
        status = .ready
      } catch is CancellationError {
        return
      } catch {
        guard requestID == searchRequestID else { return }
        status = .failed(error.localizedDescription)
      }
    }
  }

  func selectSearchResult(_ resultID: MessageSearchResult.ID?) {
    selectedSearchResultID = resultID
    guard let resultID,
      let result = searchSummary?.results.first(where: { $0.id == resultID })
    else {
      return
    }
    selectedSessionID = result.sessionId
    selectedSessionDetail = nil
    loadSelectedSession()
  }

  func limitMessageSearchToSelectedSession() {
    guard let selectedSessionID else { return }
    messageSessionFilter = selectedSessionID
    if searchSummary != nil {
      searchMessages()
    }
  }

  func clearMessageSessionFilter() {
    messageSessionFilter = nil
    if searchSummary != nil {
      searchMessages()
    }
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
    isDetailLoading = false
    sessionQuery = ""
  }

  private func clearSearchResults() {
    searchTask?.cancel()
    searchRequestID += 1
    selectedSearchResultID = nil
    messageSessionFilter = nil
    searchSummary = nil
  }

  private func selectedSearchResultBelongsToSession(_ sessionID: SessionSummary.ID?) -> Bool {
    guard let sessionID,
      let selectedSearchResultID,
      let result = searchSummary?.results.first(where: { $0.id == selectedSearchResultID })
    else {
      return false
    }
    return result.sessionId == sessionID
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
  }

  private func saveSettings() {
    if isEphemeralSettingsRun {
      return
    }
    UserDefaults.standard.set(sourcePaths, forKey: DefaultsKeys.sourcePaths)
    UserDefaults.standard.set(recentSourcePaths, forKey: DefaultsKeys.recentSourcePaths)
  }

  private func scheduleUITestQuitIfNeeded() {
    guard ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_UI_TEST_AUTO_QUIT"] == "1",
      !hasScheduledUITestQuit
    else {
      return
    }

    hasScheduledUITestQuit = true
    Task {
      try? await Task.sleep(for: .seconds(8))
      NSApp.terminate(nil)
    }
  }

  private func currentFilters() -> LogFilters {
    LogFilters(
      paths: sourcePaths,
      since: hasSinceFilter ? Self.dateFormatter.string(from: sinceDate) : nil,
      until: hasUntilFilter ? Self.dateFormatter.string(from: untilDate) : nil,
      refreshToken: refreshToken
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

  private static func stringArray(forKey key: String) -> [String] {
    UserDefaults.standard.stringArray(forKey: key) ?? []
  }
}

private enum DefaultsKeys {
  static let sourcePaths = "sourcePaths"
  static let recentSourcePaths = "recentSourcePaths"
}
