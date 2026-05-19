import SwiftUI

struct RootView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    NavigationSplitView {
      SidebarView()
        .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 420)
    } content: {
      OverviewView()
        .navigationSplitViewColumnWidth(min: 560, ideal: 780)
    } detail: {
      DetailPane()
        .navigationSplitViewColumnWidth(min: 380, ideal: 500)
    }
    .toolbar {
      ToolbarItem(placement: .navigation) {
        Button {
          model.refresh(force: true)
        } label: {
          Label("Refresh", systemImage: "arrow.clockwise")
        }
        .accessibilityIdentifier("refresh-button")
      }

      ToolbarItemGroup(placement: .primaryAction) {
        Button {
          model.exportSummary(.json)
        } label: {
          Label("Export JSON", systemImage: "doc")
        }
        .accessibilityIdentifier("export-json-button")

        Button {
          model.exportSummary(.csv)
        } label: {
          Label("Export CSV", systemImage: "tablecells")
        }
        .accessibilityIdentifier("export-csv-button")

        StatusPill(status: model.status)
          .accessibilityIdentifier("status-pill")
      }
    }
  }
}

struct SidebarView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    List(selection: $model.selectedProject) {
      Section("Source") {
        VStack(alignment: .leading, spacing: 8) {
          TextEditor(text: $model.pathDraft)
            .font(.system(.caption, design: .monospaced))
            .frame(minHeight: 82)
            .accessibilityIdentifier("source-paths-editor")
            .overlay {
              if model.pathDraft.isEmpty {
                Text("Default Codex log locations")
                  .font(.caption)
                  .foregroundStyle(.tertiary)
                  .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                  .padding(5)
                  .allowsHitTesting(false)
              }
            }
          HStack {
            Button {
              model.chooseSourcePaths()
            } label: {
              Label("Choose", systemImage: "folder.badge.plus")
            }
            .accessibilityIdentifier("source-picker-button")

            Button("Apply") {
              model.applySourcePaths()
            }
            .accessibilityIdentifier("source-apply-button")

            Button("Default") {
              model.resetSourcePaths()
            }
            .accessibilityIdentifier("source-default-button")

            if !model.recentSourcePaths.isEmpty {
              Menu("Recent") {
                ForEach(model.recentSourcePaths, id: \.self) { path in
                  Button(path) {
                    model.useRecentSourcePath(path)
                  }
                }
              }
              .accessibilityIdentifier("recent-sources-menu")
            }
          }

          if !model.sourcePaths.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
              ForEach(model.sourcePaths, id: \.self) { path in
                HStack(spacing: 6) {
                  Text(path)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                  Spacer()
                  Button {
                    model.removeSourcePath(path)
                  } label: {
                    Image(systemName: "xmark.circle")
                  }
                  .buttonStyle(.borderless)
                  .accessibilityLabel("Remove source")
                  .help("Remove source")
                }
              }
            }
          }
        }
        .padding(.vertical, 4)
      }

      Section("Filters") {
        Toggle("Since", isOn: $model.hasSinceFilter)
          .accessibilityIdentifier("since-toggle")
        DatePicker("Since Date", selection: $model.sinceDate, displayedComponents: .date)
          .labelsHidden()
          .disabled(!model.hasSinceFilter)
          .accessibilityIdentifier("since-date-picker")

        Toggle("Until", isOn: $model.hasUntilFilter)
          .accessibilityIdentifier("until-toggle")
        DatePicker("Until Date", selection: $model.untilDate, displayedComponents: .date)
          .labelsHidden()
          .disabled(!model.hasUntilFilter)
          .accessibilityIdentifier("until-date-picker")
      }

      Section("Library") {
        ProjectListRow(
          title: AppConstants.allProjectsName,
          subtitle: "\(model.projects.reduce(0) { $0 + $1.sessions }) sessions",
          tokenCount: model.projects.reduce(0) { $0 + $1.totalTokens },
          systemImage: "square.grid.2x2"
        )
        .tag(AppConstants.allProjectsName)
      }

      Section("Projects") {
        ForEach(model.projects) { project in
          ProjectListRow(
            title: project.project,
            subtitle: "\(project.sessions) sessions",
            tokenCount: project.totalTokens,
            systemImage: "folder"
          )
          .tag(project.project)
        }
      }
    }
    .listStyle(.sidebar)
    .navigationTitle("Codex Logs")
    .accessibilityIdentifier("project-sidebar")
    .onChange(of: model.selectedProject) { _, newValue in
      model.selectProject(newValue)
    }
    .onChange(of: model.hasSinceFilter) { _, _ in
      model.filtersChanged()
    }
    .onChange(of: model.hasUntilFilter) { _, _ in
      model.filtersChanged()
    }
    .onChange(of: model.sinceDate) { _, _ in
      if model.hasSinceFilter { model.filtersChanged() }
    }
    .onChange(of: model.untilDate) { _, _ in
      if model.hasUntilFilter { model.filtersChanged() }
    }
  }
}

struct ProjectListRow: View {
  let title: String
  let subtitle: String
  let tokenCount: Int
  let systemImage: String

  var body: some View {
    Label {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .lineLimit(1)
          Text(subtitle)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text(tokenCount.formatted(.number.notation(.compactName)))
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
    } icon: {
      Image(systemName: systemImage)
    }
  }
}

struct OverviewView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        HeaderView()

        if case .failed(let message) = model.status {
          ErrorBanner(message: message) {
            model.retryAfterFailure()
          }
        }

        if let summary = model.summary, summary.totals.sessions == 0 {
          EmptyLibraryView()
        }

        MetricsGrid(summary: model.summary)
        if let summary = model.summary, summary.totals.sessions > 0 {
          RepeatedPromptsView(messages: summary.repeatedUserMessages)
        }
        MessageSearchView()
        SessionsTableView()
      }
      .padding(20)
    }
    .navigationTitle(model.selectedProject)
  }
}

struct HeaderView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(model.selectedProject)
        .font(.largeTitle)
        .fontWeight(.semibold)
      Text("Local Codex usage, sessions, tokens, and message search.")
        .foregroundStyle(.secondary)
    }
  }
}

struct EmptyLibraryView: View {
  var body: some View {
    ContentUnavailableView(
      "No Logs Found",
      systemImage: "tray",
      description: Text("Choose a Codex log folder or return to the default source.")
    )
    .frame(maxWidth: .infinity, minHeight: 160)
  }
}

struct MetricsGrid: View {
  let summary: ProjectSummary?

  var body: some View {
    Grid(horizontalSpacing: 12, verticalSpacing: 12) {
      GridRow {
        MetricTile(label: "Sessions", value: summary?.totals.sessions)
        MetricTile(label: "User Messages", value: summary?.totals.userMessages)
        MetricTile(label: "Unique Messages", value: summary?.totals.uniqueUserMessages)
      }
      GridRow {
        MetricTile(label: "Total Tokens", value: summary?.tokens.totalTokens)
        MetricTile(label: "Fresh Input", value: summary?.tokens.freshInputTokens)
        MetricTile(label: "Cached Input", value: summary?.tokens.cachedInputTokens)
      }
    }
  }
}

struct RepeatedPromptsView: View {
  let messages: [RepeatedUserMessage]

  private func sessionLabel(for message: RepeatedUserMessage) -> String {
    "\(message.sessionCount.formatted()) \(message.sessionCount == 1 ? "session" : "sessions")"
  }

  var body: some View {
    GroupBox("Repeated Prompts") {
      if messages.isEmpty {
        ContentUnavailableView(
          "No Repeated Prompts",
          systemImage: "text.badge.checkmark",
          description: Text("Submitted user messages are unique in the current filters.")
        )
        .frame(maxWidth: .infinity, minHeight: 110)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(messages.prefix(5)) { message in
            VStack(alignment: .leading, spacing: 4) {
              HStack(alignment: .firstTextBaseline) {
                Text("\(message.count.formatted()) repeats")
                  .font(.caption)
                  .fontWeight(.semibold)
                  .foregroundStyle(.secondary)
                Text(sessionLabel(for: message))
                  .font(.caption)
                  .foregroundStyle(.secondary)
                Spacer()
                Text(formattedDate(message.lastSeen))
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
              Text(message.sample)
                .lineLimit(2)
                .textSelection(.enabled)
              Text(message.projects.joined(separator: ", "))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
            .padding(.vertical, 4)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

struct MetricTile: View {
  let label: String
  let value: Int?

  var body: some View {
    GroupBox {
      VStack(alignment: .leading, spacing: 8) {
        Text(label)
          .font(.caption)
          .foregroundStyle(.secondary)
        Text(value.map { $0.formatted() } ?? "...")
          .font(.title2.monospacedDigit())
          .fontWeight(.semibold)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.vertical, 4)
    }
  }
}

struct MessageSearchView: View {
  @EnvironmentObject private var model: AppModel
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    GroupBox("Message Search") {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          Image(systemName: "magnifyingglass")
            .foregroundStyle(.secondary)
          TextField("Search messages across projects", text: $model.messageQuery)
            .textFieldStyle(.plain)
            .focused($isSearchFocused)
            .accessibilityIdentifier("message-search-field")
            .onSubmit {
              model.searchMessages()
            }
          Button("Search") {
            model.searchMessages()
          }
          .keyboardShortcut(.return, modifiers: .command)
          .accessibilityIdentifier("message-search-button")

          Button {
            model.showSentMessagesForCurrentProject()
          } label: {
            Label("Messages I Sent", systemImage: "paperplane")
          }
          .help("Show your sent messages for the current project")
          .accessibilityIdentifier("show-sent-messages-button")
        }
        .padding(8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))

        HStack {
          Picker("Role", selection: $model.messageRoleFilter) {
            ForEach(MessageRoleFilter.allCases) { role in
              Text(role.label).tag(role)
            }
          }
          .pickerStyle(.segmented)
          .accessibilityIdentifier("message-role-filter")
          .onChange(of: model.messageRoleFilter) { _, _ in
            if model.searchSummary != nil {
              model.refreshMessageResults()
            }
          }

          Picker("Model", selection: $model.messageModelFilter) {
            ForEach(model.messageModelOptions, id: \.self) { modelName in
              Text(modelName).tag(modelName)
            }
          }
          .frame(maxWidth: 220)
          .accessibilityIdentifier("message-model-filter")
          .onChange(of: model.messageModelFilter) { _, _ in
            if model.searchSummary != nil {
              model.refreshMessageResults()
            }
          }
        }

        HStack {
          if let sessionLabel = model.messageSessionFilterLabel {
            Label("Session \(sessionLabel)", systemImage: "scope")
              .font(.caption)
              .foregroundStyle(.secondary)
            Button {
              model.clearMessageSessionFilter()
            } label: {
              Image(systemName: "xmark.circle.fill")
            }
            .buttonStyle(.borderless)
            .help("Clear session filter")
            .accessibilityIdentifier("message-session-filter-clear")
          } else if model.selectedSessionID != nil {
            Button {
              model.limitMessageSearchToSelectedSession()
            } label: {
              Label("Limit to Selected Session", systemImage: "scope")
            }
            .accessibilityIdentifier("message-session-filter-button")
          }
          Spacer()
        }

        if let search = model.searchSummary {
          Text(searchSummaryLabel(search))
            .font(.caption)
            .foregroundStyle(.secondary)

          if search.results.isEmpty {
            ContentUnavailableView(
              emptySearchTitle,
              systemImage: emptySearchSystemImage,
              description: Text(emptySearchDescription)
            )
            .frame(maxWidth: .infinity, minHeight: 220)
            .accessibilityIdentifier("message-search-empty-state")
          } else {
            Table(search.results, selection: $model.selectedSearchResultID) {
              TableColumn("Date/Time") { result in
                Text(formattedDate(result.timestamp))
                  .lineLimit(1)
              }
              .width(min: 150, ideal: 170)

              TableColumn("Message") { result in
                Text(result.snippet)
                  .lineLimit(2)
              }

              TableColumn("Project") { result in
                Text(result.project)
              }
              .width(min: 120, ideal: 170)

              TableColumn("Model") { result in
                Text(result.model ?? "unknown")
              }
              .width(min: 100, ideal: 130)

              TableColumn("Role") { result in
                Text(result.role.capitalized)
              }
              .width(72)
            }
            .frame(minHeight: 220)
            .accessibilityIdentifier("message-search-results-table")
            .onChange(of: model.selectedSearchResultID) { _, newValue in
              model.selectSearchResult(newValue)
            }
          }
        } else {
          Text("Search respects the current source, project, and date filters.")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
      }
      .padding(.top, 4)
      .onChange(of: model.messageSearchFocusRequest) { _, _ in
        isSearchFocused = true
      }
    }
  }

  private var isBrowsingMessages: Bool {
    guard let query = model.searchSummary?.query else { return false }
    return model.isMessageBrowseMode && query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var emptySearchTitle: String {
    if isBrowsingMessages && model.isSubmittedMessageSearch {
      return "No Sent Messages"
    }
    return isBrowsingMessages ? "No Messages" : "No Matches"
  }

  private var emptySearchSystemImage: String {
    isBrowsingMessages ? "paperplane" : "magnifyingglass"
  }

  private var emptySearchDescription: String {
    isBrowsingMessages ? "Try another project, source, or date range." : "Try another phrase or broaden the current filters."
  }

  private func searchSummaryLabel(_ search: MessageSearchSummary) -> String {
    let count = search.totalMatches.formatted()
    guard isBrowsingMessages else {
      return "\(count) matches in \(search.project)"
    }
    if model.isSubmittedMessageSearch {
      return "\(count) sent messages in \(search.project)"
    }
    return "\(count) messages in \(search.project)"
  }
}

struct SessionsTableView: View {
  @EnvironmentObject private var model: AppModel

  private var emptySessionsTitle: String {
    model.summary?.totals.sessions == 0 ? "No Sessions Found" : "No Matching Sessions"
  }

  private var emptySessionsDescription: String {
    if model.summary?.totals.sessions == 0 {
      return "Choose another source or return to the default Codex log locations."
    }
    return "Clear the session search or adjust the current filters."
  }

  var body: some View {
    GroupBox("Sessions") {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Image(systemName: "line.3.horizontal.decrease.circle")
            .foregroundStyle(.secondary)
          TextField("Search sessions", text: $model.sessionQuery)
            .textFieldStyle(.plain)
            .accessibilityIdentifier("session-search-field")
          Text("\(model.filteredSessions.count.formatted())")
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        .padding(8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))

        if model.summary != nil {
          if model.filteredSessions.isEmpty {
            ContentUnavailableView(
              emptySessionsTitle,
              systemImage: "tray",
              description: Text(emptySessionsDescription)
            )
            .frame(maxWidth: .infinity, minHeight: 280)
            .accessibilityIdentifier("sessions-empty-state")
          } else {
            Table(model.filteredSessions, selection: $model.selectedSessionID) {
              TableColumn("Session") { session in
                Text(session.shortSessionId)
                  .font(.system(.body, design: .monospaced))
              }
              .width(96)

              TableColumn("Project") { session in
                Text(session.project)
              }
              .width(min: 140, ideal: 220)

              TableColumn("User Messages") { session in
                Text(session.userMessages.formatted())
              }
              .width(110)

              TableColumn("Tokens") { session in
                Text(session.totalTokens.formatted())
              }
              .width(120)

              TableColumn("Last Seen") { session in
                Text(formattedDate(session.lastSeen))
              }
              .width(min: 140, ideal: 180)
            }
            .frame(minHeight: 280)
            .accessibilityIdentifier("sessions-table")
            .onChange(of: model.selectedSessionID) { _, newValue in
              model.selectSession(newValue)
            }
          }
        } else {
          ProgressView("Scanning local logs")
            .frame(maxWidth: .infinity, minHeight: 220)
        }
      }
      .padding(.top, 4)
    }
  }
}

struct DetailPane: View {
  @EnvironmentObject private var model: AppModel

  private var selectedSearchResult: MessageSearchResult? {
    model.searchSummary?.results.first { $0.id == model.selectedSearchResultID }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let result = selectedSearchResult {
        SearchResultInspector(
          result: result,
          detail: model.selectedSessionDetail,
          isDetailLoading: model.isDetailLoading
        )
      } else if model.isDetailLoading {
        ProgressView("Loading session")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let detail = model.selectedSessionDetail {
        SessionDetailInspector(detail: detail)
      } else {
        ContentUnavailableView(
          "No Selection",
          systemImage: "sidebar.right",
          description: Text("Select a session or search result to inspect details.")
        )
      }
      Spacer()
    }
    .padding(20)
    .navigationTitle("Inspector")
  }
}

struct SessionDetailInspector: View {
  let detail: SessionDetail

  private var userMessages: [MessageDetail] {
    detail.messages.filter { $0.role == "user" }
  }

  private var assistantMessages: [MessageDetail] {
    detail.messages.filter { $0.role == "assistant" }
  }

  private var totalTokens: Int {
    detail.tokenUsage.reduce(0) { $0 + $1.usage.totalTokens }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Label("Session", systemImage: "terminal")
          .font(.title3)
          .fontWeight(.semibold)
        LabeledContent("ID", value: detail.file.sessionId)
        LabeledContent("Lines", value: detail.file.lineCount.formatted())
        LabeledContent("Turns", value: detail.turns.count.formatted())
        LabeledContent("Messages", value: "\(userMessages.count.formatted()) user, \(assistantMessages.count.formatted()) assistant")
        LabeledContent("Tokens", value: totalTokens.formatted())
        Text(detail.file.filePath)
          .font(.caption)
          .foregroundStyle(.secondary)
          .textSelection(.enabled)

        Divider()
        InspectorSectionTitle("Turns")
        ForEach(Array(detail.turns.prefix(24).enumerated()), id: \.offset) { _, turn in
          VStack(alignment: .leading, spacing: 3) {
            Text(turn.model ?? "unknown model")
              .fontWeight(.medium)
            Text([turn.effort, formattedDate(turn.timestamp), turn.cwd].compactMap { $0 }.joined(separator: " · "))
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }

        Divider()
        InspectorSectionTitle("Messages")
        ForEach(Array(detail.messages.prefix(50).enumerated()), id: \.offset) { _, message in
          VStack(alignment: .leading, spacing: 4) {
            Text(message.role.capitalized)
              .font(.caption)
              .fontWeight(.semibold)
              .foregroundStyle(.secondary)
            Text(message.content.isEmpty ? message.sourceEvent : message.content)
              .textSelection(.enabled)
          }
          .padding(.vertical, 4)
        }

        Divider()
        DisclosureGroup("Token Events") {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(detail.tokenUsage.prefix(24).enumerated()), id: \.offset) { _, event in
              LabeledContent(formattedDate(event.timestamp), value: event.usage.totalTokens.formatted())
            }
          }
          .padding(.top, 6)
        }

        DisclosureGroup("Parser Diagnostics") {
          VStack(alignment: .leading, spacing: 8) {
            LabeledContent("Tool Events", value: detail.toolEvents.count.formatted())
            LabeledContent("Unknown Events", value: detail.unknownEvents.count.formatted())
            LabeledContent("Warnings", value: detail.warnings.count.formatted())
            ForEach(Array(detail.warnings.prefix(20).enumerated()), id: \.offset) { _, warning in
              Text("Line \(warning.lineNumber): \(warning.code) - \(warning.message)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            }
          }
          .padding(.top, 6)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct InspectorSectionTitle: View {
  let title: String

  init(_ title: String) {
    self.title = title
  }

  var body: some View {
    Text(title)
      .font(.headline)
  }
}

struct SearchResultInspector: View {
  @EnvironmentObject private var model: AppModel

  let result: MessageSearchResult
  let detail: SessionDetail?
  let isDetailLoading: Bool

  private var matchingMessageIndex: Int? {
    detail?.messages.firstIndex { message in
      message.timestamp == result.timestamp &&
        message.role == result.role &&
        message.sourceEvent == result.sourceEvent &&
        (result.turnId == nil || message.turnId == result.turnId)
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        Label("Message", systemImage: "text.bubble")
          .font(.title3)
          .fontWeight(.semibold)
        LabeledContent("Role", value: result.role.capitalized)
        LabeledContent("Project", value: result.project)
        LabeledContent("Model", value: result.model ?? "unknown")
        LabeledContent("Session", value: result.sessionId)
        LabeledContent("Time", value: formattedDate(result.timestamp))
        HStack {
          Button {
            model.copySearchResultSessionID(result)
          } label: {
            Label("Copy Session ID", systemImage: "doc.on.doc")
          }
          .accessibilityIdentifier("copy-search-session-button")

          Button {
            model.copySearchResultProject(result)
          } label: {
            Label("Copy Project", systemImage: "folder")
          }
          .accessibilityIdentifier("copy-search-project-button")

          Button {
            model.copySearchResultSnippet(result)
          } label: {
            Label("Copy Snippet", systemImage: "text.quote")
          }
          .help("Copies a whitespace-normalized snippet with local home paths shortened.")
          .accessibilityIdentifier("copy-search-snippet-button")
        }
        .buttonStyle(.bordered)

        Divider()
        Text(result.snippet)
          .textSelection(.enabled)

        Divider()
        InspectorSectionTitle("Session Context")

        if isDetailLoading {
          ProgressView("Loading session")
            .padding(.vertical, 16)
        } else if let detail {
          ForEach(Array(detail.messages.enumerated()), id: \.offset) { index, message in
            VStack(alignment: .leading, spacing: 4) {
              Text(message.role.capitalized)
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
              Text(message.content.isEmpty ? message.sourceEvent : message.content)
                .textSelection(.enabled)
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
              index == matchingMessageIndex
                ? Color.accentColor.opacity(0.16)
                : Color.clear,
              in: RoundedRectangle(cornerRadius: 6)
            )
          }
        } else {
          Text("Session context is not available.")
            .foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct StatusPill: View {
  let status: AppModel.Status

  var body: some View {
    Label(status.label, systemImage: icon)
      .labelStyle(.titleAndIcon)
      .foregroundStyle(color)
  }

  private var icon: String {
    switch status {
    case .starting, .loading:
      return "arrow.triangle.2.circlepath"
    case .ready:
      return "checkmark.circle"
    case .failed:
      return "exclamationmark.triangle"
    }
  }

  private var color: Color {
    switch status {
    case .failed:
      return .red
    case .ready:
      return .green
    default:
      return .secondary
    }
  }
}

struct ErrorBanner: View {
  let message: String
  let onRetry: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Label(message, systemImage: "exclamationmark.triangle")
        .foregroundStyle(.red)
      Spacer()
      Button("Try Again", action: onRetry)
        .accessibilityIdentifier("retry-button")
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
  }
}

func formattedDate(_ value: String?) -> String {
  guard let value, !value.isEmpty else { return "" }

  let fractionalFormatter = ISO8601DateFormatter()
  fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = fractionalFormatter.date(from: value) {
    return date.formatted(date: .abbreviated, time: .shortened)
  }

  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  if let date = formatter.date(from: value) {
    return date.formatted(date: .abbreviated, time: .shortened)
  }

  return value
}
