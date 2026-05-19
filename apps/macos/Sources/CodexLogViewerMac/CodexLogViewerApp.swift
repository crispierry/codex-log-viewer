import AppKit
import Darwin
import SwiftUI

@main
struct CodexLogViewerApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    WindowGroup("Codex Log Viewer") {
      if AppRuntime.isSmokeMode {
        EmptyView()
      } else {
        RootView()
          .environmentObject(model)
          .task {
            model.startIfNeeded()
          }
          .frame(minWidth: 1120, minHeight: 760)
      }
    }
    .commands {
      CommandGroup(replacing: .newItem) {}
      CommandMenu("Logs") {
        Button("Refresh") {
          model.refresh(force: true)
        }
        .keyboardShortcut("r", modifiers: .command)

        Button("Find in Messages") {
          model.focusMessageSearch()
        }
        .keyboardShortcut("f", modifiers: .command)

        Button("Search Messages") {
          model.searchMessages()
        }
        .keyboardShortcut(.return, modifiers: .command)

        Button("Messages I Sent") {
          model.showSentMessagesForCurrentProject()
        }

        Divider()

        Button("Choose Sources...") {
          model.chooseSourcePaths()
        }
        .keyboardShortcut("o", modifiers: .command)

        Divider()

        Button("Export Redacted JSON...") {
          model.exportSummary(.json)
        }
        .keyboardShortcut("e", modifiers: .command)

        Button("Export CSV...") {
          model.exportSummary(.csv)
        }
        .keyboardShortcut("e", modifiers: [.command, .shift])
      }
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    if AppRuntime.isSmokeMode {
      Task {
        let exitCode = await AppSmokeRunner.run()
        LocalLogEngineServer.shared.stop()
        exit(Int32(exitCode))
      }
      return
    }

    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationWillTerminate(_ notification: Notification) {
    LocalLogEngineServer.shared.stop()
  }
}

enum AppRuntime {
  static let isSmokeMode = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_SMOKE"] == "1"
}

enum AppSmokeRunner {
  static func run() async -> Int {
    do {
      let connection = try await LocalLogEngineServer.shared.start()
      let api = LogEngineAPI(baseURL: connection.baseURL, authToken: connection.authToken)
      let fixture = ProcessInfo.processInfo.environment["CODEX_LOG_VIEWER_SMOKE_FIXTURE"]
      let filters = LogFilters(paths: fixture.map { [$0] } ?? [])
      let projects = try await api.projects(filters: filters)
      let summary = try await api.summary(project: AppConstants.allProjectsName, filters: filters)
      let search = try await api.searchMessages(
        query: "parser test",
        role: .all,
        model: AppConstants.allModelsName,
        sessionID: nil,
        project: AppConstants.allProjectsName,
        filters: filters
      )
      let sentMessagesSearch = try await api.searchMessages(
        query: "",
        role: .user,
        model: AppConstants.allModelsName,
        sessionID: nil,
        project: AppConstants.allProjectsName,
        filters: filters
      )
      guard let firstSession = summary.sessions.first else {
        throw AppSmokeError.unexpected("No sessions found in smoke fixture.")
      }
      _ = try await api.sessionDetail(
        sessionID: firstSession.sessionId,
        filePath: firstSession.filePath,
        project: AppConstants.allProjectsName,
        filters: filters
      )
      let jsonExport = try await api.exportSummary(format: .json, project: AppConstants.allProjectsName, filters: filters)
      let csvExport = try await api.exportSummary(format: .csv, project: AppConstants.allProjectsName, filters: filters)
      if projects.isEmpty || search.totalMatches == 0 || sentMessagesSearch.totalMatches == 0 || jsonExport.isEmpty || csvExport.isEmpty {
        throw AppSmokeError.unexpected("Packaged app smoke workflow returned empty data.")
      }
      FileHandle.standardOutput.write(Data("Codex Log Viewer packaged smoke workflow passed.\n".utf8))
      return 0
    } catch {
      let message = "Codex Log Viewer smoke check failed: \(error.localizedDescription)\n"
      FileHandle.standardError.write(Data(message.utf8))
      return 1
    }
  }
}

enum AppSmokeError: LocalizedError {
  case unexpected(String)

  var errorDescription: String? {
    switch self {
    case .unexpected(let message):
      return message
    }
  }
}
