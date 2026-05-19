import Charts
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
          ChartsSection(summary: summary)
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

struct ChartsSection: View {
  let summary: ProjectSummary

  var body: some View {
    GroupBox("Charts") {
      VStack(alignment: .leading, spacing: 18) {
        ChartPanel(title: "Messages by Hour") {
          if hourlyMessagePoints.isEmpty {
            ChartEmptyState(title: "No Hourly Messages", systemImage: "clock")
          } else {
            Chart(hourlyMessagePoints) { point in
              BarMark(
                x: .value("Hour", point.hour),
                y: .value("Messages", point.count)
              )
              .foregroundStyle(Color.accentColor.gradient)
            }
            .chartXAxis {
              hourlyAxisMarks()
            }
            .chartXScale(domain: 0...23)
            .chartYAxis {
              AxisMarks(position: .leading)
            }
            .frame(height: 180)
            .accessibilityIdentifier("messages-by-hour-chart")
          }
        }

        ChartPanel(title: "Messages by Day of Week") {
          if weekdayMessagePoints.isEmpty {
            ChartEmptyState(title: "No Weekday Messages", systemImage: "calendar")
          } else {
            Chart(weekdayMessagePoints) { point in
              BarMark(
                x: .value("Day", point.label),
                y: .value("Messages", point.count)
              )
              .foregroundStyle(Color.teal.gradient)
            }
            .chartYAxis {
              AxisMarks(position: .leading)
            }
            .frame(height: 180)
            .accessibilityIdentifier("messages-by-weekday-chart")
          }
        }

        ChartPanel(title: "Tokens by Hour") {
          if hourlyTokenPoints.isEmpty {
            ChartEmptyState(title: "No Hourly Tokens", systemImage: "chart.bar")
          } else {
            Chart(hourlyTokenPoints) { point in
              BarMark(
                x: .value("Hour", point.hour),
                y: .value("Tokens", point.value)
              )
              .foregroundStyle(by: .value("Type", point.kind))
            }
            .chartForegroundStyleScale([
              "Input": Color.indigo,
              "Output": Color.green
            ])
            .chartXAxis {
              hourlyAxisMarks()
            }
            .chartXScale(domain: 0...23)
            .chartYAxis {
              AxisMarks(position: .leading)
            }
            .frame(height: 200)
            .accessibilityIdentifier("tokens-by-hour-chart")
          }
        }

        ChartPanel(title: "Output Tokens by Hour") {
          if hourlyOutputTokenPoints.isEmpty {
            ChartEmptyState(title: "No Hourly Output Tokens", systemImage: "arrow.up.forward")
          } else {
            Chart(hourlyOutputTokenPoints) { point in
              BarMark(
                x: .value("Hour", point.hour),
                y: .value("Output Tokens", point.count)
              )
              .foregroundStyle(Color.green.gradient)
            }
            .chartXAxis {
              hourlyAxisMarks()
            }
            .chartXScale(domain: 0...23)
            .chartYAxis {
              AxisMarks(position: .leading)
            }
            .frame(height: 160)
            .accessibilityIdentifier("output-tokens-by-hour-chart")
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.top, 4)
    }
    .accessibilityIdentifier("charts-section")
  }

  private var hourlyMessagePoints: [HourlyCountPoint] {
    let counts = summary.messagesByHour.reduce(into: Array(repeating: 0, count: 24)) { result, bucket in
      guard let hour = bucketHour(bucket.key) else { return }
      result[hour] += bucket.count
    }
    guard counts.contains(where: { $0 > 0 }) else { return [] }
    return counts.enumerated().map { HourlyCountPoint(hour: $0.offset, count: $0.element) }
  }

  private var weekdayMessagePoints: [WeekdayCountPoint] {
    let counts = summary.messagesByDay.reduce(into: Array(repeating: 0, count: 7)) { result, bucket in
      guard let weekday = bucketWeekday(bucket.key) else { return }
      result[weekday - 1] += bucket.count
    }
    guard counts.contains(where: { $0 > 0 }) else { return [] }
    return weekdayOrder.map { weekday in
      let count = counts[weekday - 1]
      return WeekdayCountPoint(weekday: weekday, label: weekdayLabel(weekday), count: count)
    }
  }

  private var hourlyTokenPoints: [HourlyTokenPoint] {
    var inputCounts = Array(repeating: 0, count: 24)
    var outputCounts = Array(repeating: 0, count: 24)
    for bucket in summary.messagesByHour {
      guard let hour = bucketHour(bucket.key) else { continue }
      inputCounts[hour] += bucket.tokens.inputTokens
      outputCounts[hour] += bucket.tokens.outputTokens
    }

    var points: [HourlyTokenPoint] = []
    for hour in 0..<24 {
      if inputCounts[hour] > 0 {
        points.append(HourlyTokenPoint(hour: hour, kind: "Input", value: inputCounts[hour]))
      }
      if outputCounts[hour] > 0 {
        points.append(HourlyTokenPoint(hour: hour, kind: "Output", value: outputCounts[hour]))
      }
    }
    return points
  }

  private var hourlyOutputTokenPoints: [HourlyCountPoint] {
    let counts = summary.messagesByHour.reduce(into: Array(repeating: 0, count: 24)) { result, bucket in
      guard let hour = bucketHour(bucket.key) else { return }
      result[hour] += bucket.tokens.outputTokens
    }
    guard counts.contains(where: { $0 > 0 }) else { return [] }
    return counts.enumerated().map { HourlyCountPoint(hour: $0.offset, count: $0.element) }
  }
}

struct ChartPanel<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.headline)
      content
    }
  }
}

struct ChartEmptyState: View {
  let title: String
  let systemImage: String

  var body: some View {
    ContentUnavailableView(title, systemImage: systemImage)
      .frame(maxWidth: .infinity, minHeight: 160)
  }
}

struct HourlyCountPoint: Identifiable {
  let hour: Int
  let count: Int

  var id: Int { hour }
}

struct WeekdayCountPoint: Identifiable {
  let weekday: Int
  let label: String
  let count: Int

  var id: Int { weekday }
}

struct HourlyTokenPoint: Identifiable {
  let hour: Int
  let kind: String
  let value: Int

  var id: String { "\(hour)-\(kind)" }
}

private let weekdayOrder = [1, 2, 3, 4, 5, 6, 7]

private func hourlyAxisMarks() -> some AxisContent {
  AxisMarks(values: [0, 6, 12, 18, 23]) { value in
    AxisGridLine()
    AxisTick()
    AxisValueLabel {
      if let hour = value.as(Int.self) {
        Text(hourLabel(hour))
      }
    }
  }
}

private func hourLabel(_ hour: Int) -> String {
  switch hour {
  case 0:
    return "12 AM"
  case 1..<12:
    return "\(hour) AM"
  case 12:
    return "12 PM"
  default:
    return "\(hour - 12) PM"
  }
}

private func weekdayLabel(_ weekday: Int) -> String {
  let symbols = Calendar.current.shortWeekdaySymbols
  guard symbols.indices.contains(weekday - 1) else {
    return String(weekday)
  }
  return symbols[weekday - 1]
}

private func bucketHour(_ key: String) -> Int? {
  guard key.count >= 13 else { return nil }
  let start = key.index(key.startIndex, offsetBy: 11)
  let end = key.index(start, offsetBy: 2)
  return Int(key[start..<end])
}

private func bucketWeekday(_ key: String) -> Int? {
  guard let date = BucketDateFormatters.day.date(from: key) else {
    return nil
  }
  return Calendar.current.component(.weekday, from: date)
}

private enum BucketDateFormatters {
  static let day: DateFormatter = {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
  }()
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
              if message.category != nil || message.variants.count > 1 {
                DisclosureGroup("View grouped messages") {
                  VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(message.variants.enumerated()), id: \.offset) { _, variant in
                      HStack(alignment: .firstTextBaseline) {
                        Text("\(variant.count.formatted())x")
                          .font(.caption.monospacedDigit())
                          .foregroundStyle(.secondary)
                          .frame(width: 34, alignment: .leading)
                        Text(variant.sample)
                          .font(.caption)
                          .lineLimit(2)
                          .textSelection(.enabled)
                      }
                    }
                  }
                  .padding(.top, 4)
                }
                .font(.caption)
              }
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
              TableColumn("Date/Time") { session in
                Text(formattedDate(session.lastSeen))
                  .lineLimit(1)
              }
              .width(min: 150, ideal: 170)

              TableColumn("Sent") { session in
                Text(session.userMessages.formatted())
              }
              .width(92)

              TableColumn("Project") { session in
                Text(session.project)
              }
              .width(min: 140, ideal: 220)

              TableColumn("Session ID") { session in
                Text(session.shortSessionId)
                  .font(.system(.body, design: .monospaced))
              }
              .width(100)
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

  var body: some View {
    SessionUserMessagesInspector(detail: detail)
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
          SessionUserMessagesInspector(detail: detail, highlightedMessageIndex: matchingMessageIndex)
        } else {
          Text("Session context is not available.")
            .foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

struct SessionUserMessagesInspector: View {
  let detail: SessionDetail
  var highlightedMessageIndex: Int?
  @State private var selectedUserMessageIndex: Int?

  private var sessionIdentity: String {
    "\(detail.file.filePath)#\(detail.file.sessionId)"
  }

  private var userMessages: [(offset: Int, element: MessageDetail)] {
    Array(detail.messages.enumerated())
      .filter { $0.element.sourceEvent == "event_msg.user_message" }
  }

  private var selectedResponseMessages: [MessageDetail] {
    guard let selectedUserMessageIndex else { return [] }
    return responseMessages(after: selectedUserMessageIndex)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Label("User Messages", systemImage: "person.text.rectangle")
          .font(.title3)
          .fontWeight(.semibold)
        Text("\(userMessages.count.formatted()) messages in this session")
          .font(.caption)
          .foregroundStyle(.secondary)

        if userMessages.isEmpty {
          ContentUnavailableView(
            "No User Messages",
            systemImage: "text.bubble",
            description: Text("This session has no submitted user messages.")
          )
          .frame(maxWidth: .infinity, minHeight: 220)
        } else {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(userMessages, id: \.offset) { item in
              Button {
                selectedUserMessageIndex = item.offset
              } label: {
                userMessageRow(message: item.element, isSelected: selectedUserMessageIndex == item.offset)
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("session-user-message-row")
            }
          }
        }

        if selectedUserMessageIndex != nil {
          Divider()
          InspectorSectionTitle("Codex Response")

          if selectedResponseMessages.isEmpty {
            Text("No Codex response was found after this message.")
              .foregroundStyle(.secondary)
          } else {
            VStack(alignment: .leading, spacing: 10) {
              ForEach(Array(selectedResponseMessages.enumerated()), id: \.offset) { _, message in
                responseCard(message)
              }
            }
          }
        } else if !userMessages.isEmpty {
          Divider()
          Text("Select a user message to show the Codex response.")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .onChange(of: sessionIdentity) { _, _ in
      selectedUserMessageIndex = nil
    }
  }

  private func userMessageRow(message: MessageDetail, isSelected: Bool) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(formattedDate(message.timestamp))
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
      Text(displayText(message))
        .font(.body)
        .lineLimit(4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      rowBackground(isSelected: isSelected),
      in: RoundedRectangle(cornerRadius: 8)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8)
        .stroke(
          isSelected || highlightedMessageIndex == messageIndex(message)
            ? Color.accentColor.opacity(0.45)
            : Color.clear,
          lineWidth: 1
        )
    )
  }

  private func responseCard(_ message: MessageDetail) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(formattedDate(message.timestamp))
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
      Text(displayText(message))
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))
  }

  private func rowBackground(isSelected: Bool) -> Color {
    isSelected ? Color.accentColor.opacity(0.16) : Color.primary.opacity(0.05)
  }

  private func responseMessages(after messageIndex: Int) -> [MessageDetail] {
    let followingMessages = detail.messages.dropFirst(messageIndex + 1)
    let sameTurnMessages = followingMessages.prefix { message in
      message.sourceEvent != "event_msg.user_message"
    }
    return uniqueMessages(
      sameTurnMessages.filter { message in
        message.role == "assistant" && !displayText(message).isEmpty
      }
    )
  }

  private func uniqueMessages(_ messages: [MessageDetail]) -> [MessageDetail] {
    var seen = Set<String>()
    return messages.filter { message in
      seen.insert(displayText(message)).inserted
    }
  }

  private func displayText(_ message: MessageDetail) -> String {
    let text = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? message.sourceEvent : text
  }

  private func messageIndex(_ message: MessageDetail) -> Int? {
    detail.messages.firstIndex(of: message)
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
