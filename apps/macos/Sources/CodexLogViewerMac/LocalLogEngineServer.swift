import Foundation

enum LocalLogEngineServerError: LocalizedError {
  case missingRepository
  case missingServerBuild(URL)
  case launchFailed(String)
  case healthCheckTimedOut(String)

  var errorDescription: String? {
    switch self {
    case .missingRepository:
      return "The app cannot find the local parser engine. Run it from the repository root or set CODEX_LOG_VIEWER_REPO."
    case .missingServerBuild(let url):
      return "The local parser engine is not built at \(url.path). Run the app from the repository root."
    case .launchFailed(let message):
      return "Could not start the local parser engine: \(message)"
    case .healthCheckTimedOut(let details):
      if details.isEmpty {
        return "The local parser engine did not become ready."
      }
      return "The local parser engine did not become ready. \(details)"
    }
  }
}

final class LocalLogEngineServer {
  static let shared = LocalLogEngineServer()

  private(set) var baseURL: URL?
  private var process: Process?
  private var temporaryDirectoryURL: URL?
  private var urlFileURL: URL?
  private var stdoutURL: URL?
  private var stderrURL: URL?
  private var stdoutHandle: FileHandle?
  private var stderrHandle: FileHandle?

  private init() {}

  func start() async throws -> URL {
    if let baseURL, process?.isRunning == true, await isHealthy(baseURL) {
      return baseURL
    }

    stop()
    try launch()

    for _ in 0..<40 {
      if process?.isRunning == false {
        let details = launchDiagnostics()
        stop()
        throw LocalLogEngineServerError.launchFailed(details.isEmpty ? "The parser engine exited before it was ready." : details)
      }

      if let serverURL = readServerURL(), await isHealthy(serverURL) {
        baseURL = serverURL
        return serverURL
      }

      try await Task.sleep(for: .milliseconds(250))
    }

    let details = launchDiagnostics()
    stop()
    throw LocalLogEngineServerError.healthCheckTimedOut(details)
  }

  func stop() {
    if let process, process.isRunning {
      process.terminate()
    }
    stdoutHandle?.closeFile()
    stderrHandle?.closeFile()
    if let temporaryDirectoryURL {
      try? FileManager.default.removeItem(at: temporaryDirectoryURL)
    }
    self.process = nil
    self.baseURL = nil
    self.temporaryDirectoryURL = nil
    self.urlFileURL = nil
    self.stdoutURL = nil
    self.stderrURL = nil
    self.stdoutHandle = nil
    self.stderrHandle = nil
  }

  private func launch() throws {
    let repoURL = try repositoryURL()
    let serverURL = repoURL.appending(path: "apps/server/dist/index.js")

    guard FileManager.default.fileExists(atPath: serverURL.path) else {
      throw LocalLogEngineServerError.missingServerBuild(serverURL)
    }

    let temporaryDirectoryURL = FileManager.default.temporaryDirectory
      .appending(path: "codex-log-viewer-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: temporaryDirectoryURL, withIntermediateDirectories: true)

    let urlFileURL = temporaryDirectoryURL.appending(path: "server-url.txt")
    let stdoutURL = temporaryDirectoryURL.appending(path: "server.stdout.log")
    let stderrURL = temporaryDirectoryURL.appending(path: "server.stderr.log")
    FileManager.default.createFile(atPath: stdoutURL.path, contents: nil)
    FileManager.default.createFile(atPath: stderrURL.path, contents: nil)

    let stdoutHandle = try FileHandle(forWritingTo: stdoutURL)
    let stderrHandle = try FileHandle(forWritingTo: stderrURL)

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.arguments = ["node", serverURL.path, "--port=0", "--url-file=\(urlFileURL.path)"]
    process.currentDirectoryURL = repoURL
    process.standardOutput = stdoutHandle
    process.standardError = stderrHandle

    do {
      try process.run()
      self.process = process
      self.temporaryDirectoryURL = temporaryDirectoryURL
      self.urlFileURL = urlFileURL
      self.stdoutURL = stdoutURL
      self.stderrURL = stderrURL
      self.stdoutHandle = stdoutHandle
      self.stderrHandle = stderrHandle
    } catch {
      stdoutHandle.closeFile()
      stderrHandle.closeFile()
      try? FileManager.default.removeItem(at: temporaryDirectoryURL)
      throw LocalLogEngineServerError.launchFailed(error.localizedDescription)
    }
  }

  private func repositoryURL() throws -> URL {
    if let repo = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_REPO"], !repo.isEmpty {
      return URL(fileURLWithPath: repo, isDirectory: true)
    }

    let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
    if FileManager.default.fileExists(atPath: cwd.appending(path: "package.json").path) {
      return cwd
    }

    throw LocalLogEngineServerError.missingRepository
  }

  private func readServerURL() -> URL? {
    guard let urlFileURL,
      let contents = try? String(contentsOf: urlFileURL, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines),
      !contents.isEmpty
    else {
      return nil
    }

    return URL(string: contents)
  }

  private func launchDiagnostics() -> String {
    let stderr = contents(of: stderrURL)
    let stdout = contents(of: stdoutURL)
    return [stderr, stdout]
      .filter { !$0.isEmpty }
      .joined(separator: "\n")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func contents(of url: URL?) -> String {
    guard let url,
      let value = try? String(contentsOf: url, encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    else {
      return ""
    }
    return value
  }

  private func isHealthy(_ baseURL: URL) async -> Bool {
    do {
      let healthURL = baseURL.appending(path: "api/health")
      let (_, response) = try await URLSession.shared.data(from: healthURL)
      return (response as? HTTPURLResponse)?.statusCode == 200
    } catch {
      return false
    }
  }
}
