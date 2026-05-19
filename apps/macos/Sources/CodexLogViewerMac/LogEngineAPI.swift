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
    try await projectsWithMetadata(filters: filters).projects
  }

  func projectsWithMetadata(filters: LogFilters) async throws -> CachedProjects {
    let response: ProjectsResponse = try await get("api/projects", query: queryItems(filters: filters, includeDateRange: false))
    return CachedProjects(projects: response.projects, cache: response.cacheMetadata)
  }

  func summary(project: String, filters: LogFilters) async throws -> ProjectSummary {
    try await summaryWithMetadata(project: project, filters: filters).summary
  }

  func summaryWithMetadata(project: String, filters: LogFilters) async throws -> CachedSummary {
    let query = queryItems(project: project, filters: filters)
    let response: SummaryResponse = try await get("api/summary", query: query)
    return CachedSummary(summary: response.summary, cache: response.cacheMetadata)
  }

  func sessionDetail(
    sessionID: String,
    filePath: String? = nil,
    dateKey: String? = nil,
    project: String,
    filters: LogFilters
  ) async throws -> SessionDetail {
    var queryItems = queryItems(project: project, filters: filters)
    queryItems.append(URLQueryItem(name: "sessionId", value: sessionID))
    if let filePath {
      queryItems.append(URLQueryItem(name: "filePath", value: filePath))
    }
    if let dateKey {
      queryItems.append(URLQueryItem(name: "dateKey", value: dateKey))
    }
    return try await get("api/session", query: queryItems)
  }

  func searchMessages(
    query: String,
    role: MessageRoleFilter,
    model: String,
    sessionID: String?,
    filePath: String? = nil,
    dateKey: String? = nil,
    project: String,
    filters: LogFilters,
    submittedOnly: Bool = false
  ) async throws -> MessageSearchSummary {
    try await searchMessagesWithMetadata(
      query: query,
      role: role,
      model: model,
      sessionID: sessionID,
      filePath: filePath,
      dateKey: dateKey,
      project: project,
      filters: filters,
      submittedOnly: submittedOnly
    ).search
  }

  func searchMessagesWithMetadata(
    query: String,
    role: MessageRoleFilter,
    model: String,
    sessionID: String?,
    filePath: String? = nil,
    dateKey: String? = nil,
    project: String,
    filters: LogFilters,
    submittedOnly: Bool = false
  ) async throws -> CachedSearch {
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
    if let dateKey {
      queryItems.append(URLQueryItem(name: "dateKey", value: dateKey))
    }
    if submittedOnly {
      queryItems.append(URLQueryItem(name: "submittedOnly", value: "true"))
    }
    queryItems.append(contentsOf: self.queryItems(project: project, filters: filters))
    let response: MessageSearchResponse = try await get("api/messages/search", query: queryItems)
    return CachedSearch(search: response.search, cache: response.cacheMetadata)
  }

  func exportSummary(format: ExportFormat, project: String, filters: LogFilters) async throws -> Data {
    var queryItems = queryItems(project: project, filters: filters)
    queryItems.append(URLQueryItem(name: "format", value: format.rawValue))
    return try await getData("api/export", query: queryItems)
  }

  func auditPreview(
    repoPath: String,
    project: String,
    filters: LogFilters,
    includeResponses: Bool
  ) async throws -> AuditPreview {
    var queryItems = queryItems(project: project, filters: filters)
    queryItems.append(URLQueryItem(name: "repoPath", value: repoPath))
    queryItems.append(URLQueryItem(name: "includeResponses", value: includeResponses ? "true" : "false"))
    let response: AuditPreviewResponse = try await get("api/audit", query: queryItems)
    return response.audit
  }

  func writeAudit(targetPath: String, markdown: String) async throws -> AuditWriteResult {
    let response: AuditWriteResponse = try await postJson(
      "api/audit",
      body: [
        "targetPath": targetPath,
        "markdown": markdown
      ]
    )
    return response.audit
  }

  private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
    let data = try await getData(path, query: query)
    return try JSONDecoder().decode(T.self, from: data)
  }

  private func postJson<T: Decodable>(_ path: String, body: [String: String]) async throws -> T {
    var request = URLRequest(url: baseURL.appending(path: path))
    request.httpMethod = "POST"
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard 200..<300 ~= statusCode else {
      let body = String(data: data, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      throw LogEngineAPIError.badStatus(path: path, statusCode: statusCode, body: body)
    }
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
    if filters.rebuildCache {
      items.append(URLQueryItem(name: "rebuild", value: "1"))
    }
    return items
  }
}

struct CachedProjects {
  let projects: [ProjectListItem]
  let cache: CacheMetadata?
}

struct CachedSummary {
  let summary: ProjectSummary
  let cache: CacheMetadata?
}

struct CachedSearch {
  let search: MessageSearchSummary
  let cache: CacheMetadata?
}
