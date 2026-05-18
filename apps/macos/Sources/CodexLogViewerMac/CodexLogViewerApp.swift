import AppKit
import SwiftUI

@main
struct CodexLogViewerApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    WindowGroup("Codex Log Viewer") {
      RootView()
        .environmentObject(model)
        .task {
          model.startIfNeeded()
        }
        .frame(minWidth: 1120, minHeight: 760)
    }
    .commands {
      CommandGroup(replacing: .newItem) {}
      CommandMenu("Logs") {
        Button("Refresh") {
          model.refresh(force: true)
        }
        .keyboardShortcut("r", modifiers: .command)

        Button("Search Messages") {
          model.searchMessages()
        }
        .keyboardShortcut("f", modifiers: .command)
      }
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationWillTerminate(_ notification: Notification) {
    LocalLogEngineServer.shared.stop()
  }
}
