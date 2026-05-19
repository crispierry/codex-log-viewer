import Foundation

enum LogEngineAPIError: LocalizedError {
  case badStatus(path: String, statusCode: Int, body: String)

  var errorDescription: String? {
    switch self {
    case .badStatus(let path, let statusCode, let body):
      if body.isEmpty {
        return "The local parser engine returned HTTP \(statusCode) for \(path)."
      }
      return "The local parser engine returned HTTP \(statusCode) for \(path): \(body)"
    }
  }
}

struct LogEngineAPI {
  let baseURL: URL
  let authToken: String

  func projects(filters: LogFilters) async throws -> [ProjectListItem] {
    let response: ProjectsResponse = try await get("api/projects", query: queryItems(filters: filters, includeDateRange: false))
    return response.projects
  }

  func summary(project: String, filters: LogFilters) async throws -> ProjectSummary {
    let query = queryItems(project: project, filters: filters)
    let response: SummaryResponse = try await get("api/summary", query: query)
    return response.summary
  }

  func sessionDetail(sessionID: String, filePath: String? = nil, project: String, filters: LogFilters) async throws -> SessionDetail {
    var queryItems = queryItems(project: project, filters: filters)
    queryItems.append(URLQueryItem(name: "sessionId", value: sessionID))
    if let filePath {
      queryItems.append(URLQueryItem(name: "filePath", value: filePath))
    }
    return try await get("api/session", query: queryItems)
  }

  func searchMessages(
    query: String,
    role: MessageRoleFilter,
    model: String,
    sessionID: String?,
    filePath: String? = nil,
    project: String,
    filters: LogFilters
  ) async throws -> MessageSearchSummary {
    var queryItems = [
      URLQueryItem(name: "q", value: query),
      URLQueryItem(name: "role", value: role.rawValue),
      URLQueryItem(name: "limit", value: "100")
    ]
    if model != AppConstants.allModelsName {
      queryItems.append(URLQueryItem(name: "model", value: model))
    }
    if let sessionID {
      queryItems.append(URLQueryItem(name: "sessionId", value: sessionID))
    }
    if let filePath {
      queryItems.append(URLQueryItem(name: "filePath", value: filePath))
    }
    queryItems.append(contentsOf: self.queryItems(project: project, filters: filters))
    let response: MessageSearchResponse = try await get("api/messages/search", query: queryItems)
    return response.search
  }

  func exportSummary(format: ExportFormat, project: String, filters: LogFilters) async throws -> Data {
    var queryItems = queryItems(project: project, filters: filters)
    queryItems.append(URLQueryItem(name: "format", value: format.rawValue))
    return try await getData("api/export", query: queryItems)
  }

  private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
    let data = try await getData(path, query: query)
    return try JSONDecoder().decode(T.self, from: data)
  }

  private func getData(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
    var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
    components.queryItems = query.isEmpty ? nil : query

    var request = URLRequest(url: components.url!)
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await URLSession.shared.data(for: request)
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard 200..<300 ~= statusCode else {
      let body = String(data: data, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw LogEngineAPIError.badStatus(path: path, statusCode: statusCode, body: body)
    }
    return data
  }

  private func queryItems(project: String? = nil, filters: LogFilters, includeDateRange: Bool = true) -> [URLQueryItem] {
    var items: [URLQueryItem] = []
    if let project, project != AppConstants.allProjectsName {
      items.append(URLQueryItem(name: "project", value: project))
    }
    for path in filters.paths {
      items.append(URLQueryItem(name: "path", value: path))
    }
    if includeDateRange {
      if let since = filters.since {
        items.append(URLQueryItem(name: "since", value: since))
      }
      if let until = filters.until {
        items.append(URLQueryItem(name: "until", value: until))
      }
    }
    if filters.refreshToken > 0 {
      items.append(URLQueryItem(name: "refresh", value: String(filters.refreshToken)))
    }
    return items
  }
}
