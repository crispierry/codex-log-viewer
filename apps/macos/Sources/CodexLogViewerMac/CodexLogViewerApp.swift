import AppKit
import Darwin
import SwiftUI

@main
struct CodexLogViewerApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @Environment(\.openWindow) private var openWindow
  @FocusedValue(\.appModel) private var focusedModel
  private var commandModel: AppModel? {
    focusedModel ?? appDelegate.commandModel
  }

  var body: some Scene {
    WindowGroup("Codex Log Viewer", id: AppWindowID.main) {
      if AppRuntime.isSmokeMode {
        EmptyView()
      } else {
        AppWindowRootView(onModelReady: { model in
          appDelegate.setCommandModel(model)
        })
          .onAppear {
            appDelegate.setMainWindowOpener {
              openWindow(id: AppWindowID.main)
            }
          }
      }
    }
    .commands {
      CommandGroup(replacing: .appInfo) {
        Button("About Codex Log Viewer") {
          AppModel.showAboutBox()
        }
        .accessibilityIdentifier("about-menu-item")
      }

      CommandGroup(replacing: .newItem) {
        Button("New Tab") {
          appDelegate.openViewerTab {
            openWindow(id: AppWindowID.main)
          }
        }
        .keyboardShortcut("t", modifiers: .command)
        .accessibilityIdentifier("new-tab-menu-item")
      }

      CommandGroup(after: .sidebar) {
        if let model = commandModel {
          Toggle(
            "Show Sessions",
            isOn: Binding(
              get: { model.showSessionBrowser },
              set: { model.setSessionBrowserVisible($0) }
            )
          )
          .accessibilityIdentifier("view-show-sessions-menu-item")

          Divider()

          Button("Operational Messages...") {
            if let model = commandModel {
              appDelegate.setCommandModel(model)
            }
            openWindow(id: AppWindowID.operationalMessages)
            NSApp.activate(ignoringOtherApps: true)
          }
          .accessibilityIdentifier("view-operational-messages-panel-menu-item")
        } else {
          Button("Show Sessions") {}
            .disabled(true)
            .accessibilityIdentifier("view-show-sessions-menu-item")

          Button("Operational Messages...") {}
            .disabled(true)
            .accessibilityIdentifier("view-operational-messages-panel-menu-item")
        }
      }

      CommandMenu("Logs") {
        if let model = commandModel {
          Button("Status: \(model.status.label)") {}
            .disabled(true)
            .accessibilityIdentifier("status-menu-item")

          Divider()

          Button("Refresh") {
            model.refresh(force: true)
          }
          .keyboardShortcut("r", modifiers: .command)

          Button("Rebuild Local Cache") {
            model.rebuildLocalCache()
          }
          .keyboardShortcut("r", modifiers: [.command, .shift])

          Button("Find in Messages") {
            model.focusMessageSearch()
          }
          .keyboardShortcut("f", modifiers: .command)

          Button("Search Messages") {
            model.searchMessages()
          }
          .keyboardShortcut(.return, modifiers: .command)

          Divider()

          Button(model.sourceMenuLabel) {}
            .disabled(true)

          Button("Choose Codex Log Location...") {
            model.chooseSourcePaths()
          }
          .keyboardShortcut("o", modifiers: .command)
          .accessibilityIdentifier("source-picker-menu-item")

          Button("Use Default Codex Log Locations") {
            model.resetSourcePaths()
          }
          .accessibilityIdentifier("source-default-menu-item")

          Menu("Recent Log Locations") {
            if model.recentSourcePaths.isEmpty {
              Button("No Recent Locations") {}
                .disabled(true)
            } else {
              ForEach(model.recentSourcePaths, id: \.self) { path in
                Button(path) {
                  model.useRecentSourcePath(path)
                }
              }
            }
          }
          .accessibilityIdentifier("recent-sources-menu")

          Divider()

          Button("Export Redacted JSON...") {
            model.exportSummary(.json)
          }
          .keyboardShortcut("e", modifiers: .command)
          .accessibilityIdentifier("export-json-menu-item")

          Button("Export CSV...") {
            model.exportSummary(.csv)
          }
          .keyboardShortcut("e", modifiers: [.command, .shift])
          .accessibilityIdentifier("export-csv-menu-item")
        } else {
          Button("Status: Unavailable") {}
            .disabled(true)
            .accessibilityIdentifier("status-menu-item")
        }
      }

      CommandMenu("Evals") {
        if let model = commandModel {
          Button("Open Evals") {
            appDelegate.setCommandModel(model)
            openWindow(id: AppWindowID.evals)
            NSApp.activate(ignoringOtherApps: true)
          }
          .keyboardShortcut("l", modifiers: [.command, .shift])
          .accessibilityIdentifier("evals-open-menu-item")

          Divider()

          Button("Export Fixture Draft...") {
            model.exportEvalFixtureDraft()
          }
          .accessibilityIdentifier("evals-export-fixture-draft-menu-item")
        } else {
          Button("Open Evals") {}
            .disabled(true)
            .accessibilityIdentifier("evals-open-menu-item")
          Button("Export Fixture Draft...") {}
            .disabled(true)
            .accessibilityIdentifier("evals-export-fixture-draft-menu-item")
        }
      }

      CommandGroup(replacing: .help) {
        Button("Codex Log Viewer Help") {
          AppModel.showHelpBox()
        }
        .keyboardShortcut("?", modifiers: .command)
        .accessibilityIdentifier("help-menu-item")

        Button("Open Usage Guide") {
          AppModel.openUsageGuide()
        }
        .accessibilityIdentifier("usage-guide-menu-item")
      }
    }

    Window("Operational Messages", id: AppWindowID.operationalMessages) {
      OperationalMessagesWindowRootView(appDelegate: appDelegate)
    }
    .windowResizability(.contentSize)

    Window("Evals", id: AppWindowID.evals) {
      EvalsWindowRootView(appDelegate: appDelegate)
    }
  }
}

private struct AppWindowRootView: View {
  @StateObject private var model = AppModel()
  var onModelReady: (AppModel) -> Void = { _ in }

  var body: some View {
    RootView()
      .environmentObject(model)
      .focusedSceneValue(\.appModel, model)
      .focusedValue(\.appModel, model)
      .onAppear {
        onModelReady(model)
      }
      .task {
        model.startIfNeeded()
      }
      .frame(minWidth: 760, minHeight: 560)
  }
}

private struct OperationalMessagesWindowRootView: View {
  @ObservedObject var appDelegate: AppDelegate
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    if let model = appDelegate.commandModel {
      OperationalMessagesPanelView(model: model) {
        dismiss()
      }
    } else {
      Text("Open Codex Log Viewer first.")
        .padding(18)
        .frame(width: 300)
    }
  }
}

private struct OperationalMessagesPanelView: View {
  @ObservedObject var model: AppModel
  let close: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Operational Messages")
        .font(.headline)

      Toggle(
        "All",
        isOn: Binding(
          get: { model.areAllOperationalMessageCategoriesVisible },
          set: { model.setAllOperationalMessageCategoriesVisible($0) }
        )
      )
      .toggleStyle(.checkbox)
      .accessibilityIdentifier("view-operational-all-filter")

      Divider()

      VStack(alignment: .leading, spacing: 9) {
        ForEach(model.operationalMessageCategoryOptions, id: \.self) { category in
          Toggle(
            category,
            isOn: Binding(
              get: { model.isOperationalPromptCategoryVisible(category) },
              set: { model.setOperationalMessageCategory(category, isVisible: $0) }
            )
          )
          .toggleStyle(.checkbox)
          .accessibilityIdentifier("view-operational-message-filter")
        }
      }

      HStack {
        Spacer()
        Button("Done") {
          close()
        }
        .keyboardShortcut(.defaultAction)
        .accessibilityIdentifier("view-operational-messages-done-button")
      }
    }
    .padding(18)
    .frame(width: 300)
  }
}

private struct AppModelFocusedValueKey: FocusedValueKey {
  typealias Value = AppModel
}

private extension FocusedValues {
  var appModel: AppModel? {
    get { self[AppModelFocusedValueKey.self] }
    set { self[AppModelFocusedValueKey.self] = newValue }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, ObservableObject {
  @Published private(set) var commandModel: AppModel?
  private var tabBarObservers: [NSObjectProtocol] = []
  private var openMainWindow: (() -> Void)?
  private var fallbackViewerWindow: NSWindow?

  func setMainWindowOpener(_ opener: @escaping () -> Void) {
    openMainWindow = opener
  }

  func setCommandModel(_ model: AppModel) {
    guard commandModel !== model else {
      return
    }
    commandModel = model
  }

  func ensureViewerWindowVisible(activate: Bool) {
    if let window = preferredViewerWindow() {
      window.makeKeyAndOrderFront(nil)
      if activate {
        NSApp.activate(ignoringOtherApps: true)
      }
      syncViewerTabBars()
      return
    }

    openMainWindow?()
    restoreViewerWindowAfterOpening(activate: activate, attemptsRemaining: 8)
  }

  func openViewerTab(openWindow: @escaping () -> Void) {
    let sourceWindow = preferredViewerWindow()
    let existingWindowIDs = Set(NSApp.windows.filter(isViewerWindow).map(ObjectIdentifier.init))

    openWindow()

    guard let sourceWindow else {
      DispatchQueue.main.async { [weak self] in
        self?.syncViewerTabBars()
      }
      return
    }

    attachNewViewerWindow(
      asTabOf: sourceWindow,
      excluding: existingWindowIDs,
      attemptsRemaining: 8
    )
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    if AppRuntime.isSmokeMode {
      Task {
        let exitCode = await AppSmokeRunner.run()
        LocalLogEngineServer.shared.stop()
        exit(Int32(exitCode))
      }
      return
    }

    installTabBarVisibilityObservers()
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationWillTerminate(_ notification: Notification) {
    removeTabBarVisibilityObservers()
    LocalLogEngineServer.shared.stop()
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag {
      ensureViewerWindowVisible(activate: true)
    }
    return true
  }

  private func installTabBarVisibilityObservers() {
    NSWindow.allowsAutomaticWindowTabbing = true

    let center = NotificationCenter.default
    let notifications: [Notification.Name] = [
      NSApplication.didUpdateNotification,
      NSWindow.didBecomeKeyNotification,
      NSWindow.didBecomeMainNotification,
      NSWindow.willCloseNotification
    ]
    tabBarObservers = notifications.map { notificationName in
      center.addObserver(forName: notificationName, object: nil, queue: .main) { [weak self] _ in
        self?.syncViewerTabBars()
      }
    }

    DispatchQueue.main.async { [weak self] in
      self?.syncViewerTabBars()
    }
  }

  private func removeTabBarVisibilityObservers() {
    let center = NotificationCenter.default
    for observer in tabBarObservers {
      center.removeObserver(observer)
    }
    tabBarObservers.removeAll()
  }

  private func syncViewerTabBars() {
    var syncedTabGroupIDs = Set<ObjectIdentifier>()

    for window in NSApp.windows where isViewerWindow(window) {
      window.tabbingMode = .preferred

      guard let tabGroup = window.tabGroup else {
        continue
      }

      let tabGroupID = ObjectIdentifier(tabGroup)
      guard syncedTabGroupIDs.insert(tabGroupID).inserted else {
        continue
      }

      syncTabBarVisibility(for: tabGroup, fallbackWindow: window)
    }
  }

  private func syncTabBarVisibility(for tabGroup: NSWindowTabGroup, fallbackWindow: NSWindow) {
    let viewerWindowCount = tabGroup.windows.filter(isViewerWindow).count
    let shouldShowTabBar = viewerWindowCount > 1

    if tabGroup.isTabBarVisible != shouldShowTabBar {
      (tabGroup.selectedWindow ?? fallbackWindow).toggleTabBar(nil)
    }
  }

  private func attachNewViewerWindow(
    asTabOf sourceWindow: NSWindow,
    excluding existingWindowIDs: Set<ObjectIdentifier>,
    attemptsRemaining: Int
  ) {
    if let newWindow = NSApp.windows.first(where: { window in
      isViewerWindow(window)
        && !existingWindowIDs.contains(ObjectIdentifier(window))
    }) {
      if !windowsShareTabGroup(newWindow, sourceWindow) {
        sourceWindow.addTabbedWindow(newWindow, ordered: .above)
      }
      newWindow.makeKeyAndOrderFront(nil)
      syncViewerTabBars()
      return
    }

    guard attemptsRemaining > 0 else {
      syncViewerTabBars()
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak sourceWindow] in
      guard let self, let sourceWindow else {
        return
      }
      self.attachNewViewerWindow(
        asTabOf: sourceWindow,
        excluding: existingWindowIDs,
        attemptsRemaining: attemptsRemaining - 1
      )
    }
  }

  private func windowsShareTabGroup(_ firstWindow: NSWindow, _ secondWindow: NSWindow) -> Bool {
    guard let firstTabGroup = firstWindow.tabGroup,
      let secondTabGroup = secondWindow.tabGroup
    else {
      return false
    }

    return firstTabGroup === secondTabGroup
  }

  private func preferredViewerWindow() -> NSWindow? {
    [NSApp.keyWindow, NSApp.mainWindow].compactMap { window in
      guard let window, isViewerWindow(window) else {
        return nil
      }
      return window
    }.first ?? NSApp.windows.first(where: isViewerWindow)
  }

  private func restoreViewerWindowAfterOpening(activate: Bool, attemptsRemaining: Int) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      guard let self else { return }
      if let window = self.preferredViewerWindow() {
        window.makeKeyAndOrderFront(nil)
        if activate {
          NSApp.activate(ignoringOtherApps: true)
        }
        self.syncViewerTabBars()
        return
      }

      guard attemptsRemaining > 0 else {
        self.openFallbackViewerWindow(activate: activate)
        self.syncViewerTabBars()
        return
      }

      self.restoreViewerWindowAfterOpening(
        activate: activate,
        attemptsRemaining: attemptsRemaining - 1
      )
    }
  }

  private func openFallbackViewerWindow(activate: Bool) {
    let window = fallbackViewerWindow ?? NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1040, height: 680),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    fallbackViewerWindow = window
    window.title = "Codex Logs"
    window.minSize = NSSize(width: 760, height: 560)
    window.tabbingMode = .preferred
    window.contentView = NSHostingView(rootView: AppWindowRootView(onModelReady: { [weak self] model in
      self?.setCommandModel(model)
    }))
    window.center()
    window.makeKeyAndOrderFront(nil)
    if activate {
      NSApp.activate(ignoringOtherApps: true)
    }
  }

  private func isViewerWindow(_ window: NSWindow) -> Bool {
    ["Codex Log Viewer", "Codex Logs"].contains(window.title)
      && window.canBecomeMain
      && !(window is NSPanel)
  }
}

enum AppWindowID {
  static let main = "main"
  static let operationalMessages = "operational-messages"
  static let evals = "evals"
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
        filters: filters,
        submittedOnly: true
      )
      guard let firstSession = summary.sessions.first else {
        throw AppSmokeError.unexpected("No sessions found in smoke fixture.")
      }
      let detail = try await api.sessionDetail(
        sessionID: firstSession.sessionId,
        filePath: firstSession.filePath,
        dateKey: firstSession.dateKey,
        project: AppConstants.allProjectsName,
        filters: filters
      )
      guard let firstUserMessage = SessionInteractionBuilder.userMessageOffsets(in: detail).first,
        let interaction = SessionInteractionBuilder.interaction(
          in: detail,
          selectedUserMessageIndex: firstUserMessage.offset
        ),
        !interaction.assistantMessages.isEmpty
      else {
        throw AppSmokeError.unexpected("Packaged app smoke workflow could not reconstruct a Codex interaction.")
      }
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
