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
        scheduleUITestWorkflowIfNeeded(api: api, filters: filters)
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
    saveSettings()
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
    hasSinceFilter = UserDefaults.standard.bool(forKey: DefaultsKeys.hasSinceFilter)
    hasUntilFilter = UserDefaults.standard.bool(forKey: DefaultsKeys.hasUntilFilter)
    if let savedSinceDate = Self.date(forKey: DefaultsKeys.sinceDate) {
      sinceDate = savedSinceDate
    }
    if let savedUntilDate = Self.date(forKey: DefaultsKeys.untilDate) {
      untilDate = savedUntilDate
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
          try await Task.sleep(for: .seconds(5))
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
    selectedSessionID = result.sessionId

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
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    guard detail.messages.contains(where: { $0.content.contains("parser test") }) else {
      throw AppSmokeError.unexpected("The selected search result did not load full session context.")
    }
    selectedSessionDetail = detail

    messageSessionFilter = result.sessionId
    let sessionSearch = try await api.searchMessages(
      query: messageQuery,
      role: .all,
      model: AppConstants.allModelsName,
      sessionID: result.sessionId,
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    guard sessionSearch.totalMatches >= 1 else {
      throw AppSmokeError.unexpected("The selected-session message filter returned no fixture matches.")
    }

    let jsonExport = try await api.exportSummary(
      format: .json,
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    let csvExport = try await api.exportSummary(
      format: .csv,
      project: AppConstants.allProjectsName,
      filters: dateFilters
    )
    let jsonText = String(data: jsonExport, encoding: .utf8) ?? ""
    let csvText = String(data: csvExport, encoding: .utf8) ?? ""
    guard jsonText.contains("[redacted]"),
      !jsonText.contains("/Users/example"),
      csvText.contains("user_messages")
    else {
      throw AppSmokeError.unexpected("The UI workflow export checks did not pass.")
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
}

private enum DefaultsKeys {
  static let sourcePaths = "sourcePaths"
  static let recentSourcePaths = "recentSourcePaths"
  static let hasSinceFilter = "hasSinceFilter"
  static let hasUntilFilter = "hasUntilFilter"
  static let sinceDate = "sinceDate"
  static let untilDate = "untilDate"
}
