import Foundation
import Darwin
import Security

struct LocalLogEngineConnection {
  let baseURL: URL
  let authToken: String
}

private struct LocalLogEngineLocation {
  let serverURL: URL
  let workingDirectoryURL: URL
  let nodeExecutableURL: URL?
}

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
  private var authToken: String?

  private init() {}

  func start() async throws -> LocalLogEngineConnection {
    if let baseURL, let authToken, process?.isRunning == true, await isHealthy(baseURL, authToken: authToken) {
      return LocalLogEngineConnection(baseURL: baseURL, authToken: authToken)
    }

    stop()
    let authToken = Self.generateAuthToken()
    try launch(authToken: authToken)

    for _ in 0..<40 {
      if process?.isRunning == false {
        let details = launchDiagnostics()
        stop()
        throw LocalLogEngineServerError.launchFailed(details.isEmpty ? "The parser engine exited before it was ready." : details)
      }

      if let serverURL = readServerURL(), await isHealthy(serverURL, authToken: authToken) {
        baseURL = serverURL
        self.authToken = authToken
        return LocalLogEngineConnection(baseURL: serverURL, authToken: authToken)
      }

      try await Task.sleep(for: .milliseconds(250))
    }

    let details = launchDiagnostics()
    stop()
    throw LocalLogEngineServerError.healthCheckTimedOut(details)
  }

  func stop() {
    if let process, process.isRunning {
      let processIdentifier = process.processIdentifier
      process.terminate()
      let deadline = Date().addingTimeInterval(2)
      while process.isRunning && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.05)
      }
      if process.isRunning {
        kill(processIdentifier, SIGKILL)
      }
      process.waitUntilExit()
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
    self.authToken = nil
  }

  private func launch(authToken: String) throws {
    let engineLocation = try locateEngine()
    let serverURL = engineLocation.serverURL

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
    if let nodeExecutableURL = engineLocation.nodeExecutableURL {
      process.executableURL = nodeExecutableURL
      process.arguments = [serverURL.path, "--port=0", "--url-file=\(urlFileURL.path)"]
    } else {
      process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      process.arguments = ["node", serverURL.path, "--port=0", "--url-file=\(urlFileURL.path)"]
    }
    process.currentDirectoryURL = engineLocation.workingDirectoryURL
    process.standardOutput = stdoutHandle
    process.standardError = stderrHandle
    var environment = ProcessInfo.processInfo.environment
    environment["CODEX_LOG_VIEWER_AUTH_TOKEN"] = authToken
    environment["CODEX_LOG_VIEWER_CACHE_DIR"] = try cacheDirectoryURL().path
    environment["CODEX_LOG_VIEWER_EVALS_DIR"] = try evalsDirectoryURL().path
    process.environment = environment

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

  private func locateEngine() throws -> LocalLogEngineLocation {
    if let engineDirectory = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_ENGINE_DIR"], !engineDirectory.isEmpty {
      let engineURL = URL(fileURLWithPath: engineDirectory, isDirectory: true)
      return LocalLogEngineLocation(
        serverURL: engineURL.appending(path: "apps/server/dist/index.js"),
        workingDirectoryURL: engineURL,
        nodeExecutableURL: nodeExecutableURL(engineURL: engineURL)
      )
    }

    if let resourceURL = Bundle.main.resourceURL {
      let engineURL = resourceURL.appending(path: "engine", directoryHint: .isDirectory)
      let serverURL = engineURL.appending(path: "apps/server/dist/index.js")
      if FileManager.default.fileExists(atPath: serverURL.path) {
        return LocalLogEngineLocation(
          serverURL: serverURL,
          workingDirectoryURL: engineURL,
          nodeExecutableURL: nodeExecutableURL(engineURL: engineURL)
        )
      }
    }

    let repoURL = try repositoryURL()
    return LocalLogEngineLocation(
      serverURL: repoURL.appending(path: "apps/server/dist/index.js"),
      workingDirectoryURL: repoURL,
      nodeExecutableURL: nil
    )
  }

  private func nodeExecutableURL(engineURL: URL) -> URL? {
    if let nodePath = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_NODE"], !nodePath.isEmpty {
      return URL(fileURLWithPath: nodePath)
    }

    let bundledNodeURL = Bundle.main.resourceURL?
      .appending(path: "node/bin/node")
    if let bundledNodeURL, FileManager.default.isExecutableFile(atPath: bundledNodeURL.path) {
      return bundledNodeURL
    }

    let engineNodeURL = engineURL.appending(path: "node/bin/node")
    if FileManager.default.isExecutableFile(atPath: engineNodeURL.path) {
      return engineNodeURL
    }

    return nil
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

  private func cacheDirectoryURL() throws -> URL {
    if let cacheDir = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_CACHE_DIR"], !cacheDir.isEmpty {
      let url = URL(fileURLWithPath: cacheDir, isDirectory: true)
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      return url
    }

    let appSupportURL = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let cacheURL = appSupportURL
      .appending(path: "Codex Log Viewer", directoryHint: .isDirectory)
      .appending(path: "Cache", directoryHint: .isDirectory)
      .appending(path: "v1", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: cacheURL, withIntermediateDirectories: true)
    return cacheURL
  }

  private func evalsDirectoryURL() throws -> URL {
    if let evalsDir = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_EVALS_DIR"], !evalsDir.isEmpty {
      let url = URL(fileURLWithPath: evalsDir, isDirectory: true)
      try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      return url
    }

    let appSupportURL = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let evalsURL = appSupportURL
      .appending(path: "Codex Log Viewer", directoryHint: .isDirectory)
      .appending(path: "Evals", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: evalsURL, withIntermediateDirectories: true)
    return evalsURL
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

  private func isHealthy(_ baseURL: URL, authToken: String) async -> Bool {
    do {
      let healthURL = baseURL.appending(path: "api/health")
      var request = URLRequest(url: healthURL)
      request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
      let (_, response) = try await URLSession.shared.data(for: request)
      return (response as? HTTPURLResponse)?.statusCode == 200
    } catch {
      return false
    }
  }

  private static func generateAuthToken() -> String {
    var bytes = [UInt8](repeating: 0, count: 32)
    let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    if status == errSecSuccess {
      return bytes.map { String(format: "%02x", $0) }.joined()
    }
    return "\(UUID().uuidString)-\(UUID().uuidString)"
  }
}
