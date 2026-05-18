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
  @Published var searchSummary: MessageSearchSummary?
  @Published var selectedSearchResultID: MessageSearchResult.ID?
  @Published var pathDraft = ""
  @Published var sourcePaths: [String] = []
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

  func startIfNeeded() {
    guard !hasStarted else { return }
    hasStarted = true

    Task {
      do {
        status = .starting
        let url = try await LocalLogEngineServer.shared.start()
        api = LogEngineAPI(baseURL: url)
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
        if let selectedSessionID, !summary.sessions.contains(where: { $0.id == selectedSessionID }) {
          clearSelectedSession()
        }
        status = .ready
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
    sourcePaths = pathDraft
      .split(whereSeparator: { $0 == "\n" || $0 == "," })
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
    selectedProject = AppConstants.allProjectsName
    clearSelectionState()
    refresh(force: true)
  }

  func resetSourcePaths() {
    pathDraft = ""
    sourcePaths = []
    selectedProject = AppConstants.allProjectsName
    clearSelectionState()
    refresh(force: true)
  }

  func filtersChanged() {
    clearSelectionState()
    refresh()
  }

  func selectSession(_ sessionID: SessionSummary.ID?) {
    selectedSessionID = sessionID
    selectedSearchResultID = nil
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

    searchTask = Task {
      do {
        status = .loading
        let search = try await api.searchMessages(query: trimmedQuery, project: project, filters: filters)
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

  func exportSummary(_ format: ExportFormat) {
    guard let api else { return }
    let panel = NSSavePanel()
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = exportFilename(format)
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
    searchSummary = nil
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

  private static let dateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()
}
