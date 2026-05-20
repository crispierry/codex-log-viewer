import Charts
import SwiftUI

struct RootView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    HSplitView {
      SidebarView()
        .frame(minWidth: 170, idealWidth: 230, maxWidth: 270)
      ProjectWorkspaceView()
        .frame(minWidth: 540)
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
    }
  }
}

struct ProjectWorkspaceView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      WorkspaceHeaderView()
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
      Divider()

      Group {
        switch model.selectedSection {
        case .browse:
          BrowseWorkspaceView()
        case .overview:
          OverviewSectionView()
        case .search:
          SearchSectionView()
        case .audit:
          AuditSectionView()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

struct WorkspaceHeaderView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 5) {
        Text(model.selectedProject)
          .font(.title2)
          .fontWeight(.semibold)
          .lineLimit(1)
        HStack(spacing: 10) {
          if let activityRangeText = model.activityRangeText {
            Text(activityRangeText)
              .accessibilityIdentifier("activity-range-label")
          }
          if let cacheStatusText = model.cacheStatusText {
            Text(cacheStatusText)
              .accessibilityIdentifier("cache-status-label")
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }

      Spacer(minLength: 12)

      DateRangeControlView()

      Picker("Section", selection: $model.selectedSection) {
        ForEach(AppSection.allCases) { section in
          Text(section.label).tag(section)
        }
      }
      .labelsHidden()
      .pickerStyle(.segmented)
      .frame(minWidth: 260, idealWidth: 340, maxWidth: 380)
    }
  }
}

struct DateRangeControlView: View {
  @EnvironmentObject private var model: AppModel
  @State private var isShowingPopover = false

  var body: some View {
    Button {
      isShowingPopover.toggle()
    } label: {
      Label(model.dateRangeButtonTitle, systemImage: "calendar")
        .lineLimit(1)
    }
    .buttonStyle(.bordered)
    .help("Filter activity by day, week, month, year, or custom range")
    .accessibilityIdentifier("date-range-button")
    .popover(isPresented: $isShowingPopover, arrowEdge: .bottom) {
      DateRangePopoverView()
        .environmentObject(model)
    }
  }
}

struct DateRangePopoverView: View {
  @EnvironmentObject private var model: AppModel
  private let labelColumnWidth: CGFloat = 52

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Activity Range")
        .font(.headline)

      formRow(label: "Range") {
        Picker(
          "Range",
          selection: Binding(
            get: { model.dateRangeMode },
            set: { model.setDateRangeMode($0) }
          )
        ) {
          ForEach(DateRangeMode.allCases) { mode in
            Text(mode.label).tag(mode)
          }
        }
        .labelsHidden()
        .pickerStyle(.segmented)
        .accessibilityIdentifier("date-range-mode-picker")
      }

      switch model.dateRangeMode {
      case .all:
        detailText("All local Codex activity is included.")
      case .custom:
        VStack(alignment: .leading, spacing: 10) {
          formRow(label: "Start") {
            DatePicker(
              "Start",
              selection: Binding(
                get: { model.sinceDate },
                set: { model.setCustomSinceDate($0) }
              ),
              in: ...model.latestSelectableDate,
              displayedComponents: .date
            )
            .labelsHidden()
            .frame(width: 116, alignment: .leading)
            .accessibilityIdentifier("date-range-start-picker")
          }

          formRow(label: "End") {
            DatePicker(
              "End",
              selection: Binding(
                get: { model.untilDate },
                set: { model.setCustomUntilDate($0) }
              ),
              in: ...model.latestSelectableDate,
              displayedComponents: .date
            )
            .labelsHidden()
            .frame(width: 116, alignment: .leading)
            .accessibilityIdentifier("date-range-end-picker")
          }
        }
      default:
        formRow(label: model.dateRangeMode.anchorLabel) {
          DatePicker(
            model.dateRangeMode.anchorLabel,
            selection: Binding(
              get: { model.dateAnchorDate },
              set: { model.setDateAnchorDate($0) }
            ),
            in: ...model.latestSelectableDate,
            displayedComponents: .date
          )
          .labelsHidden()
          .frame(width: 116, alignment: .leading)
          .accessibilityIdentifier("date-anchor-picker")
        }
      }

      detailText(model.dateRangeDetailText)
        .accessibilityIdentifier("date-range-summary-label")

      HStack {
        Spacer()
        Button("Clear") {
          model.clearDateRange()
        }
        .accessibilityIdentifier("date-range-clear-button")
      }
    }
    .padding(16)
    .frame(width: 430)
  }

  private func formRow<Content: View>(
    label: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    HStack(alignment: .center, spacing: 10) {
      Text(label)
        .font(.callout)
        .frame(width: labelColumnWidth, alignment: .leading)
      content()
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private func detailText(_ text: String) -> some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(.secondary)
      .padding(.leading, labelColumnWidth + 10)
  }
}

struct SidebarView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    List(
      selection: Binding(
        get: { model.selectedProject },
        set: { model.selectProject($0) }
      )
    ) {
      Section("Library") {
        ProjectListRow(
          title: AppConstants.allProjectsName,
          sessions: model.projects.reduce(0) { $0 + $1.sessions },
          userMessages: model.projects.reduce(0) { $0 + $1.messages },
          tokenCount: model.projects.reduce(0) { $0 + $1.totalTokens },
          lastSeen: model.projects.compactMap(\.lastSeen).max(),
          systemImage: "square.grid.2x2"
        )
        .tag(AppConstants.allProjectsName)
      }

      Section {
        ForEach(model.sortedProjects) { project in
          ProjectListRow(
            title: project.project,
            sessions: project.sessions,
            userMessages: project.messages,
            tokenCount: project.totalTokens,
            lastSeen: project.lastSeen,
            systemImage: "folder"
          )
          .tag(project.project)
        }
      } header: {
        ProjectSectionHeader()
      }
    }
    .listStyle(.sidebar)
    .navigationTitle("Codex Logs")
    .accessibilityIdentifier("project-sidebar")
  }

  private func countLabel(_ count: Int, singular: String, plural: String) -> String {
    "\(count.formatted()) \(count == 1 ? singular : plural)"
  }
}

struct ProjectSectionHeader: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    HStack(spacing: 6) {
      Text("Projects")
      Spacer()
      Menu {
        Picker(
          "Sort Projects",
          selection: Binding(
            get: { model.projectSortOption },
            set: { model.setProjectSortOption($0) }
          )
        ) {
          ForEach(ProjectSortOption.allCases) { option in
            Text(option.label).tag(option)
          }
        }
      } label: {
        Label("Sort: \(model.projectSortOption.shortLabel)", systemImage: "arrow.up.arrow.down")
      }
      .font(.caption)
      .menuStyle(.borderlessButton)
      .fixedSize()
      .help("Sort projects by \(model.projectSortOption.label)")
      .accessibilityIdentifier("project-sort-menu")
    }
  }
}

struct ProjectListRow: View {
  let title: String
  let sessions: Int
  let userMessages: Int
  let tokenCount: Int
  let lastSeen: String?
  let systemImage: String

  var body: some View {
    Label {
      HStack(spacing: 8) {
        Text(title)
          .fontWeight(.medium)
          .lineLimit(1)
          .truncationMode(.middle)
          .frame(maxWidth: .infinity, alignment: .leading)

        ProjectMessageCountBadge(count: userMessages)
      }
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(systemImage == "square.grid.2x2" ? Color.accentColor : Color.secondary)
    }
    .padding(.vertical, 3)
    .help(helpText)
    .accessibilityLabel(accessibilityText)
  }

  private var metadataText: String {
    "\(countLabel(sessions, singular: "session", plural: "sessions")) - \(tokenCount.formatted(.number.notation(.compactName))) tokens"
  }

  private var helpText: String {
    let details = "\(userMessages.formatted()) sent messages, \(metadataText)"
    if let lastSeen, !lastSeen.isEmpty {
      return "\(title)\n\(details)\nLast session \(formattedDate(lastSeen))"
    }
    return "\(title)\n\(details)"
  }

  private var accessibilityText: String {
    "\(title), \(userMessages.formatted()) sent messages, \(metadataText)"
  }

  private func countLabel(_ count: Int, singular: String, plural: String) -> String {
    "\(count.formatted()) \(count == 1 ? singular : plural)"
  }
}

struct ProjectMessageCountBadge: View {
  let count: Int

  var body: some View {
    Text(count.formatted())
      .font(.callout.monospacedDigit())
      .fontWeight(.semibold)
      .foregroundStyle(.secondary)
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .padding(.horizontal, 6)
      .padding(.vertical, 2)
      .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
  }
}

struct BrowseWorkspaceView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      if case .failed(let message) = model.status {
        ErrorBanner(message: message) {
          model.retryAfterFailure()
        }
        .padding(12)
      }

      HSplitView {
        if model.showSessionBrowser {
          SessionBrowserColumn()
            .frame(minWidth: 190, idealWidth: 280, maxWidth: 380)
        }
        SentMessagesBrowserColumn()
          .frame(minWidth: 230, idealWidth: model.showSessionBrowser ? 340 : 380, maxWidth: 560)
        InteractionBrowserColumn()
          .frame(minWidth: 280, idealWidth: 520)
      }
    }
  }
}

struct BrowserColumnStatusBar: View {
  let title: String
  let subtitle: String?

  init(_ title: String, subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
  }

  var body: some View {
    HStack(spacing: 8) {
      Text(title)
        .font(.caption)
        .fontWeight(.semibold)
        .foregroundStyle(.primary)
      if let subtitle {
        Text(subtitle)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
    }
    .lineLimit(1)
    .padding(.horizontal, 10)
    .frame(height: 24)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.primary.opacity(0.045))
  }
}

struct SessionBrowserColumn: View {
  @EnvironmentObject private var model: AppModel

  private var emptySessionsTitle: String {
    model.summary?.totals.sessions == 0 ? "No Sessions Found" : "No Matching Sessions"
  }

  private var emptySessionsDescription: String {
    if model.summary?.totals.sessions == 0 {
      return "Choose another source or return to the default Codex log locations."
    }
    return "Adjust the current filters."
  }

  var body: some View {
    let sessions = model.summary?.sessions ?? []

    VStack(spacing: 0) {
      Group {
        if model.summary != nil {
          if sessions.isEmpty {
            ContentUnavailableView(
              emptySessionsTitle,
              systemImage: "tray",
              description: Text(emptySessionsDescription)
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityIdentifier("sessions-empty-state")
          } else {
            List(sessions) { session in
              Button {
                model.selectSession(session.id)
              } label: {
                SessionBrowserRow(
                  session: session,
                  isSelected: model.selectedSessionID == session.id
                )
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .contentShape(Rectangle())
              .buttonStyle(.plain)
              .listRowInsets(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
            }
            .listStyle(.plain)
            .accessibilityIdentifier("sessions-table")
          }
        } else {
          ProgressView("Scanning local logs")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)

      Divider()
      BrowserColumnStatusBar(
        "Sessions",
        subtitle: "\(sessions.count.formatted()) visible"
      )
    }
    .background(.background)
  }
}

struct SessionBrowserRow: View {
  let session: SessionSummary
  let isSelected: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(formattedDate(session.lastSeen))
          .font(.body)
          .fontWeight(.medium)
          .lineLimit(1)
        Spacer()
        Text(session.shortSessionId)
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      HStack(spacing: 8) {
        Label("\(session.userMessages.formatted()) sent", systemImage: "paperplane")
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      Text(session.project)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      isSelected ? Color.accentColor.opacity(0.16) : Color.clear,
      in: RoundedRectangle(cornerRadius: 8)
    )
    .contentShape(Rectangle())
  }
}

struct SentMessagesBrowserColumn: View {
  @EnvironmentObject private var model: AppModel

  private var sessionUserMessages: [(offset: Int, element: MessageDetail)] {
    guard let detail = model.selectedSessionDetail else { return [] }
    return model.visibleUserMessageOffsets(in: detail, dateKey: model.selectedSessionDateKey)
  }

  private var sessionAllUserMessages: [(offset: Int, element: MessageDetail)] {
    guard let detail = model.selectedSessionDetail else { return [] }
    return SessionInteractionBuilder.userMessageOffsets(in: detail, dateKey: model.selectedSessionDateKey)
  }

  private var browseMessages: [MessageSearchResult] {
    model.browseMessages
  }

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        Label("User Messages", systemImage: "paperplane")
          .font(.title3)
          .fontWeight(.semibold)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 16)
      .padding(.top, 14)
      .padding(.bottom, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityIdentifier("messages-column-title")

      Group {
        if model.showSessionBrowser {
          sessionMessagesView
        } else {
          projectMessagesView
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)

      Divider()
      BrowserColumnStatusBar(
        "User Messages",
        subtitle: statusSubtitle
      )
    }
    .background(.background)
  }

  @ViewBuilder
  private var sessionMessagesView: some View {
    if model.isDetailLoading {
      ProgressView("Loading messages")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if model.selectedSessionID == nil {
      ContentUnavailableView(
        "Select a Session",
        systemImage: "list.bullet.rectangle",
        description: Text("Choose a session to see sent messages.")
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if sessionUserMessages.isEmpty {
      ContentUnavailableView(
        sessionAllUserMessages.isEmpty ? "No Sent Messages" : "No Visible Messages",
        systemImage: "paperplane",
        description: Text(
          sessionAllUserMessages.isEmpty
            ? "This session has no submitted user messages."
            : "Turn on at least one operational message family in the View menu."
        )
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ScrollViewReader { proxy in
        List(sessionUserMessages, id: \.offset) { item in
          Button {
            model.selectedUserMessageIndex = item.offset
          } label: {
            SentMessageBrowserRow(
              message: item.element,
              isSelected: model.selectedUserMessageIndex == item.offset
            )
          }
          .id(item.offset)
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
          .buttonStyle(.plain)
          .listRowInsets(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
        }
        .listStyle(.plain)
        .accessibilityIdentifier("browse-messages-list")
        .onChange(of: model.selectedUserMessageIndex) { _, newValue in
          guard let newValue else { return }
          proxy.scrollTo(newValue, anchor: .center)
        }
        .onAppear {
          guard let selectedUserMessageIndex = model.selectedUserMessageIndex else { return }
          proxy.scrollTo(selectedUserMessageIndex, anchor: .center)
        }
      }
    }
  }

  @ViewBuilder
  private var projectMessagesView: some View {
    projectMessagesContent
  }

  @ViewBuilder
  private var projectMessagesContent: some View {
    if model.isBrowseMessagesLoading && browseMessages.isEmpty {
      ProgressView("Loading messages")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else if browseMessages.isEmpty {
      ContentUnavailableView(
        model.areBrowseMessagesHiddenByOperationalFilters ? "No Visible Messages" : "No Sent Messages",
        systemImage: "paperplane",
        description: Text(
          model.areBrowseMessagesHiddenByOperationalFilters
            ? "Turn on at least one operational message family in the View menu."
            : "No submitted messages match the selected project and date filters."
        )
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    } else {
      ScrollViewReader { proxy in
        List(browseMessages) { message in
          Button {
            model.selectBrowseMessage(message.id)
          } label: {
            SentMessageResultBrowserRow(
              message: message,
              isSelected: model.selectedBrowseMessageID == message.id
            )
          }
          .id(message.id)
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
          .buttonStyle(.plain)
          .listRowInsets(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
        }
        .listStyle(.plain)
        .accessibilityIdentifier("browse-messages-list")
        .onChange(of: model.selectedBrowseMessageID) { _, newValue in
          guard let newValue else { return }
          proxy.scrollTo(newValue, anchor: .center)
        }
        .onAppear {
          guard let selectedBrowseMessageID = model.selectedBrowseMessageID else { return }
          proxy.scrollTo(selectedBrowseMessageID, anchor: .center)
        }
      }
    }
  }

  private var statusSubtitle: String? {
    if model.showSessionBrowser {
      if model.selectedSessionID == nil {
        return "Select a session"
      }
      if sessionUserMessages.count != sessionAllUserMessages.count {
        return "\(sessionUserMessages.count.formatted()) visible of \(sessionAllUserMessages.count.formatted()) sent"
      }
      return "\(sessionUserMessages.count.formatted()) sent"
    }
    if model.isBrowseMessagesLoading && browseMessages.isEmpty {
      return "Loading"
    }
    guard let summary = model.browseMessagesSummary else {
      return nil
    }
    if browseMessages.count != summary.results.count {
      return "\(browseMessages.count.formatted()) visible of \(summary.totalMatches.formatted()) sent"
    }
    if summary.totalMatches > summary.results.count {
      return "\(summary.results.count.formatted()) of \(summary.totalMatches.formatted()) sent"
    }
    return "\(summary.totalMatches.formatted()) sent"
  }
}

struct SentMessageBrowserRow: View {
  let message: MessageDetail
  let isSelected: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        PromptIntentBadge(key: message.promptIntentKey, label: message.promptIntent)
        Text(formattedDate(message.timestamp))
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        Spacer(minLength: 8)
      }
      Text(messageDisplayText(message))
        .font(.body)
        .lineLimit(4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .promptIntentCardChrome(key: message.promptIntentKey, isSelected: isSelected)
    .contentShape(Rectangle())
  }
}

struct SentMessageResultBrowserRow: View {
  let message: MessageSearchResult
  let isSelected: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        PromptIntentBadge(key: message.promptIntentKey, label: message.promptIntent)
        Label {
          Text(message.project)
            .lineLimit(1)
            .truncationMode(.middle)
        } icon: {
          Image(systemName: "folder")
        }
        .font(.caption)
        .foregroundStyle(.secondary)

        Text(formattedDate(message.timestamp))
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        Spacer(minLength: 8)
        if let model = message.model, !model.isEmpty {
          Text(model)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      Text(message.content.trimmingCharacters(in: .whitespacesAndNewlines))
        .font(.body)
        .lineLimit(4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .promptIntentCardChrome(key: message.promptIntentKey, isSelected: isSelected)
    .contentShape(Rectangle())
  }
}

struct PromptIntentBadge: View {
  let key: String?
  let label: String?

  var body: some View {
    if let label, !label.isEmpty {
      Text(label)
        .lineLimit(1)
      .font(.caption)
      .fontWeight(.semibold)
      .foregroundStyle(projectFocusColor(for: key ?? ""))
      .accessibilityLabel("Prompt category: \(label)")
    }
  }
}

private struct PromptIntentCardChrome: ViewModifier {
  let key: String?
  let isSelected: Bool
  var isHighlighted = false

  private var tint: Color {
    projectFocusColor(for: key ?? "")
  }

  func body(content: Content) -> some View {
    content
      .background(
        isSelected ? Color.accentColor.opacity(0.14) : Color.primary.opacity(0.045),
        in: RoundedRectangle(cornerRadius: 8)
      )
      .overlay(alignment: .leading) {
        Rectangle()
          .fill(tint.opacity(0.75))
          .frame(width: 3)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 8)
          .stroke(
            isSelected || isHighlighted ? Color.accentColor.opacity(0.45) : Color.primary.opacity(0.08),
            lineWidth: 1
          )
      }
      .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

private extension View {
  func promptIntentCardChrome(key: String?, isSelected: Bool = false, isHighlighted: Bool = false) -> some View {
    modifier(PromptIntentCardChrome(key: key, isSelected: isSelected, isHighlighted: isHighlighted))
  }
}

struct InteractionBrowserColumn: View {
  @EnvironmentObject private var model: AppModel

  private var selectedInteraction: SessionInteraction? {
    guard let detail = model.selectedSessionDetail,
      let selectedUserMessageIndex = model.selectedUserMessageIndex
    else {
      return nil
    }
    return SessionInteractionBuilder.interaction(in: detail, selectedUserMessageIndex: selectedUserMessageIndex)
  }

  var body: some View {
    VStack(spacing: 0) {
      Group {
        if model.isDetailLoading {
          ProgressView("Loading interaction")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.selectedSessionID == nil {
          ContentUnavailableView(
            model.showSessionBrowser ? "Select a Session" : "Select a Message",
            systemImage: "sidebar.right",
            description: Text(
              model.showSessionBrowser
                ? "Choose a session and sent message to inspect Codex's response."
                : "Choose a sent message to inspect Codex's response."
            )
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if model.selectedUserMessageIndex == nil {
          ContentUnavailableView(
            "Select a Message",
            systemImage: "text.bubble",
            description: Text("Choose a sent message to show the Codex interaction.")
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let selectedInteraction {
          ScrollView {
            CodexInteractionView(interaction: selectedInteraction)
              .padding(16)
          }
        } else {
          ContentUnavailableView(
            "Interaction Not Found",
            systemImage: "exclamationmark.triangle",
            description: Text("This message could not be matched to a Codex response.")
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)

      Divider()
      BrowserColumnStatusBar("Codex Interaction", subtitle: interactionSubtitle)
    }
    .background(.background)
  }

  private var interactionSubtitle: String? {
    guard let selectedInteraction else { return nil }
    let responseCount = selectedInteraction.assistantMessages.count
    let toolCount = selectedInteraction.toolEvents.count
    let responseLabel = "\(responseCount.formatted()) \(responseCount == 1 ? "response" : "responses")"
    if toolCount > 0 {
      let toolLabel = "\(toolCount.formatted()) \(toolCount == 1 ? "tool" : "tools")"
      return "\(responseLabel) · \(toolLabel)"
    }
    return responseLabel
  }
}

struct OverviewSectionView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
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
          ProjectFocusView(summary: summary.promptIntents)
          ChartsSection(summary: summary)
        }
      }
      .padding(20)
    }
  }
}

struct SearchSectionView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        if case .failed(let message) = model.status {
          ErrorBanner(message: message) {
            model.retryAfterFailure()
          }
        }
        MessageSearchView()
      }
      .padding(20)
    }
  }
}

struct AuditSectionView: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      if case .failed(let message) = model.status {
        ErrorBanner(message: message) {
          model.retryAfterFailure()
        }
        .padding([.horizontal, .top], 16)
      }

      AuditControlBar()
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
      Divider()

      if model.isAuditLoading && model.auditReviewMarkdown.isEmpty {
        ProgressView("Generating audit preview")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if model.auditReviewMarkdown.isEmpty {
        ContentUnavailableView(
          "No Audit Preview",
          systemImage: "doc.badge.gearshape",
          description: Text("Choose a repository and generate a preview.")
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        VStack(spacing: 0) {
          AuditPreviewHeader()
          Divider()
          TextEditor(text: $model.auditReviewMarkdown)
            .font(.system(.body, design: .monospaced))
            .scrollContentBackground(.hidden)
            .background(.background)
            .accessibilityIdentifier("audit-markdown-editor")
        }
      }
    }
    .background(.background)
  }
}

struct AuditControlBar: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 10) {
        Image(systemName: "folder")
          .foregroundStyle(.secondary)
        TextField(
          "Repository path",
          text: Binding(
            get: { model.auditRepoPathDraft },
            set: { model.setAuditRepoPathDraft($0) }
          )
        )
          .textFieldStyle(.roundedBorder)
          .accessibilityIdentifier("audit-repo-path-field")
        Button {
          model.chooseAuditRepoPath()
        } label: {
          Label("Choose Repository", systemImage: "folder.badge.gearshape")
            .labelStyle(.iconOnly)
        }
        .help("Choose repository")
        .accessibilityIdentifier("audit-choose-repo-button")
      }

      HStack(spacing: 12) {
        Toggle(
          "Responses",
          isOn: Binding(
            get: { model.auditIncludeResponses },
            set: { model.setAuditIncludeResponses($0) }
          )
        )
        .toggleStyle(.switch)
        .accessibilityIdentifier("audit-include-responses-toggle")

        Text(model.auditTargetPathText)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
          .truncationMode(.middle)

        Spacer()

        if let message = model.auditStatusMessage {
          Text(message)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Button {
          model.generateAuditPreview()
        } label: {
          Label("Generate", systemImage: "wand.and.stars")
        }
        .disabled(!model.canGenerateAudit)
        .accessibilityIdentifier("audit-generate-button")

        Button {
          model.approveAuditMarkdown()
        } label: {
          Label("Approve", systemImage: "checkmark.seal")
        }
        .buttonStyle(.borderedProminent)
        .disabled(!model.canApproveAudit)
        .accessibilityIdentifier("audit-approve-button")
      }
    }
  }
}

struct AuditPreviewHeader: View {
  @EnvironmentObject private var model: AppModel

  var body: some View {
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Merged Worklog Preview")
          .font(.headline)
        Text(model.auditMergeSummaryText)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()

      if let preview = model.auditPreview {
        Label("\(preview.generatedSections.formatted()) generated", systemImage: "doc.text")
          .font(.caption)
          .foregroundStyle(.secondary)
        Label("\(preview.appendedSections.formatted()) new", systemImage: "plus.circle")
          .font(.caption)
          .foregroundStyle(preview.appendedSections > 0 ? .primary : .secondary)
        Label("\(preview.skippedSections.formatted()) present", systemImage: "checkmark.circle")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Button {
        model.openAuditWorklog()
      } label: {
        Label("Open Worklog", systemImage: "arrow.up.forward.app")
      }
      .disabled(model.auditPreview == nil)
      .accessibilityIdentifier("audit-open-worklog-button")
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
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
      if let activityRangeText = model.activityRangeText {
        Text(activityRangeText)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("activity-range-label")
      }
      if let cacheStatusText = model.cacheStatusText {
        Text(cacheStatusText)
          .font(.caption)
          .foregroundStyle(.tertiary)
          .accessibilityIdentifier("cache-status-label")
      }
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
        MetricTile(label: "Sent Messages", value: summary?.totals.userMessages)
        MetricTile(label: "Automations", value: summary?.totals.automationMessages)
      }
      GridRow {
        MetricTile(label: "Unique Messages", value: summary?.totals.uniqueUserMessages)
        MetricTile(label: "Total Tokens", value: summary?.tokens.totalTokens)
        MetricTile(label: "Fresh Input", value: summary?.tokens.freshInputTokens)
      }
      GridRow {
        MetricTile(label: "Cached Input", value: summary?.tokens.cachedInputTokens)
        MetricTile(label: "Output Tokens", value: summary?.tokens.outputTokens)
        MetricTile(label: "Reasoning Tokens", value: summary?.tokens.reasoningOutputTokens)
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

struct ProjectFocusView: View {
  let summary: PromptIntentSummary
  @State private var showsAllCategories = false

  private var buckets: [PromptIntentBucket] {
    summary.buckets.filter { $0.count > 0 }
  }

  private var visibleBuckets: [PromptIntentBucket] {
    showsAllCategories ? buckets : Array(buckets.prefix(7))
  }

  private var leadingBucket: PromptIntentBucket? {
    buckets.first
  }

  var body: some View {
    GroupBox("Project Focus") {
      if summary.totalMessages == 0 {
        ContentUnavailableView(
          "No Prompt Activity",
          systemImage: "text.bubble",
          description: Text("No submitted user messages are in the current filters.")
        )
        .frame(maxWidth: .infinity, minHeight: 160)
      } else {
        VStack(alignment: .leading, spacing: 16) {
          projectFocusHeader

          ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 22) {
              ProjectFocusDonutChart(buckets: buckets, totalMessages: summary.totalMessages)
                .frame(width: 220, height: 220)
              projectFocusCategoryList
            }

            VStack(alignment: .leading, spacing: 16) {
              ProjectFocusDonutChart(buckets: buckets, totalMessages: summary.totalMessages)
                .frame(maxWidth: .infinity, minHeight: 220, maxHeight: 240)
              projectFocusCategoryList
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
      }
    }
    .accessibilityIdentifier("project-focus-section")
  }

  private var projectFocusHeader: some View {
    HStack(alignment: .firstTextBaseline) {
      VStack(alignment: .leading, spacing: 4) {
        Text("\(summary.totalMessages.formatted()) prompts analyzed")
          .font(.headline)
        Text(classificationSubtitle)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer(minLength: 16)

      if let leadingBucket {
        HStack(spacing: 6) {
          Circle()
            .fill(projectFocusColor(for: leadingBucket.key))
            .frame(width: 8, height: 8)
          Text("Top: \(leadingBucket.label)")
            .font(.caption)
            .fontWeight(.semibold)
            .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.quaternary, in: Capsule())
      }
    }
  }

  private var classificationSubtitle: String {
    if summary.unclassifiedMessages == 0 {
      return "\(summary.classifiedMessages.formatted()) classified by work type"
    }
    return "\(summary.classifiedMessages.formatted()) classified · \(summary.unclassifiedMessages.formatted()) other"
  }

  private var projectFocusCategoryList: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(visibleBuckets) { bucket in
        ProjectFocusCategoryRow(bucket: bucket, totalMessages: summary.totalMessages)
      }

      if buckets.count > 7 {
        Button {
          withAnimation(.snappy(duration: 0.18)) {
            showsAllCategories.toggle()
          }
        } label: {
          Label(
            showsAllCategories
              ? "Show fewer categories"
              : "Show all \(buckets.count.formatted()) categories",
            systemImage: showsAllCategories ? "chevron.up.circle" : "chevron.down.circle"
          )
        }
        .buttonStyle(.plain)
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityIdentifier("project-focus-toggle-all-categories")
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityIdentifier("project-focus-category-list")
  }
}

struct ProjectFocusDonutChart: View {
  let buckets: [PromptIntentBucket]
  let totalMessages: Int

  var body: some View {
    ZStack {
      Chart(buckets) { bucket in
        SectorMark(
          angle: .value("Prompts", bucket.count),
          innerRadius: .ratio(0.62),
          angularInset: 1.2
        )
        .cornerRadius(4)
        .foregroundStyle(projectFocusColor(for: bucket.key))
      }
      .chartLegend(.hidden)
      .accessibilityIdentifier("project-focus-pie-chart")

      VStack(spacing: 2) {
        Text(totalMessages.formatted())
          .font(.title3.monospacedDigit())
          .fontWeight(.semibold)
        Text("prompts")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .accessibilityHidden(true)
    }
  }
}

struct ProjectFocusCategoryRow: View {
  let bucket: PromptIntentBucket
  let totalMessages: Int

  private var percentageText: String {
    "\(bucket.percentage.formatted(.number.precision(.fractionLength(1))))%"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Circle()
          .fill(projectFocusColor(for: bucket.key))
          .frame(width: 8, height: 8)
        Text(bucket.label)
          .font(.subheadline)
          .fontWeight(.semibold)
          .lineLimit(1)
        Spacer(minLength: 8)
        Text("\(bucket.count.formatted()) · \(percentageText)")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }

      ProgressView(value: Double(bucket.count), total: Double(max(totalMessages, 1)))
        .tint(projectFocusColor(for: bucket.key))
        .frame(height: 6)

      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("\(bucket.sessionCount.formatted()) \(bucket.sessionCount == 1 ? "session" : "sessions")")
          .font(.caption)
          .foregroundStyle(.secondary)

        if let example = bucket.examples.first {
          Text(example)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .truncationMode(.tail)
            .textSelection(.enabled)
        }
      }
    }
    .padding(.vertical, 2)
  }
}

private func projectFocusColor(for key: String) -> Color {
  switch key {
  case "feature-design":
    return .cyan
  case "implementation":
    return .accentColor
  case "bug-fixes":
    return .red
  case "git-commands":
    return .purple
  case "deploy-release":
    return .orange
  case "run-build-app":
    return .green
  case "code-review-qa":
    return .blue
  case "planning-strategy":
    return .orange
  case "research":
    return .mint
  case "documentation":
    return .brown
  case "testing-verification":
    return .indigo
  case "refactor-cleanup":
    return .pink
  case "content-creation":
    return .teal
  case "data-analysis":
    return .yellow
  case "feedback-context":
    return .secondary
  case "plan-approvals":
    return .gray
  default:
    return .secondary
  }
}

struct RepeatedPromptsView: View {
  @EnvironmentObject private var model: AppModel

  let messages: [RepeatedUserMessage]

  private var categoryOptions: [(category: String, count: Int)] {
    Dictionary(grouping: messages.compactMap(\.category), by: { $0 })
      .map { category, values in (category: category, count: values.count) }
      .sorted { lhs, rhs in
        lhs.category.localizedCaseInsensitiveCompare(rhs.category) == .orderedAscending
      }
  }

  private var visibleMessages: [RepeatedUserMessage] {
    messages.filter { message in
      guard let category = message.category else { return true }
      if model.isOperationalPromptCategory(category), !model.isOperationalPromptCategoryVisible(category) {
        return false
      }
      return !model.hiddenRepeatedPromptCategories.contains(category)
    }
  }

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
          if !categoryOptions.isEmpty {
            repeatedPromptCategoryFilters
          }

          if visibleMessages.isEmpty {
            ContentUnavailableView(
              "No Visible Repeated Prompts",
              systemImage: "line.3.horizontal.decrease.circle",
              description: Text("Turn on at least one grouped prompt family to show repeated prompts.")
            )
            .frame(maxWidth: .infinity, minHeight: 110)
          }

          ForEach(visibleMessages.prefix(5)) { message in
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

  private var repeatedPromptCategoryFilters: some View {
    HStack(alignment: .center, spacing: 12) {
      Text("Show")
        .font(.caption)
        .foregroundStyle(.secondary)
      ForEach(categoryOptions, id: \.category) { option in
        Toggle(
          isOn: Binding(
            get: { categoryFilterIsVisible(option.category) },
            set: { setCategoryFilter(option.category, isVisible: $0) }
          )
        ) {
          Text(option.category)
        }
        .toggleStyle(.checkbox)
        .font(.caption)
        .accessibilityIdentifier("repeated-prompt-category-filter")
      }
    }
  }

  private func categoryFilterIsVisible(_ category: String) -> Bool {
    if model.isOperationalPromptCategory(category) {
      return model.isOperationalPromptCategoryVisible(category)
    }
    return !model.hiddenRepeatedPromptCategories.contains(category)
  }

  private func setCategoryFilter(_ category: String, isVisible: Bool) {
    if model.isOperationalPromptCategory(category) {
      model.setOperationalMessageCategory(category, isVisible: isVisible)
    } else {
      model.setRepeatedPromptCategory(category, isVisible: isVisible)
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

  private var selectedSearchResult: MessageSearchResult? {
    model.searchResults.first { $0.id == model.selectedSearchResultID }
  }

  private var searchResults: [MessageSearchResult] {
    model.searchResults
  }

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
        }
        .padding(8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))

        HStack(alignment: .center, spacing: 8) {
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

          Spacer(minLength: 8)

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
              Label("Limit to Selected Day", systemImage: "scope")
            }
            .accessibilityIdentifier("message-session-filter-button")
          }
        }

        if let search = model.searchSummary {
          Text(searchSummaryLabel(search, visibleCount: searchResults.count))
            .font(.caption)
            .foregroundStyle(.secondary)

          if searchResults.isEmpty {
            ContentUnavailableView(
              "No Matches",
              systemImage: "magnifyingglass",
              description: Text(messageSearchEmptyDescription(search))
            )
            .frame(maxWidth: .infinity, minHeight: 220)
            .accessibilityIdentifier("message-search-empty-state")
          } else {
            Table(searchResults, selection: $model.selectedSearchResultID) {
              TableColumn("Date/Time") { result in
                Text(compactFormattedDate(result.timestamp))
                  .lineLimit(1)
              }
              .width(min: 118, ideal: 132, max: 146)

              TableColumn("Message") { result in
                VStack(alignment: .leading, spacing: 4) {
                  if let promptIntent = result.promptIntent, !promptIntent.isEmpty {
                    PromptIntentBadge(key: result.promptIntentKey, label: promptIntent)
                  }
                  HighlightedSearchText(
                    text: result.snippet,
                    query: model.messageQuery,
                    lineLimit: 2,
                    collapsesWhitespace: true
                  )
                }
                .padding(.vertical, 2)
              }

              TableColumn("Project") { result in
                Text(result.project)
                  .lineLimit(1)
              }
              .width(min: 118, ideal: 148, max: 178)

              TableColumn("Role") { result in
                Text(result.role.capitalized)
                  .lineLimit(1)
              }
              .width(64)
            }
            .frame(minHeight: 220)
            .accessibilityIdentifier("message-search-results-table")
            SearchResultDetailView(result: selectedSearchResult)
          }
        } else {
          Text("Search current messages by source, project, and date filters.")
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

  private func searchSummaryLabel(_ search: MessageSearchSummary, visibleCount: Int) -> String {
    if visibleCount != search.results.count {
      return "\(visibleCount.formatted()) visible of \(search.totalMatches.formatted()) matches in \(search.project)"
    }
    return "\(search.totalMatches.formatted()) matches in \(search.project)"
  }

  private func messageSearchEmptyDescription(_ search: MessageSearchSummary) -> String {
    if !model.areAllOperationalMessageCategoriesVisible && model.messageRoleFilter == .user {
      return "Turn on at least one operational message family in the View menu."
    }
    return search.results.isEmpty
      ? "Try another phrase or broaden the current filters."
      : "Turn on at least one operational message family in the View menu."
  }
}

struct SearchResultDetailView: View {
  @EnvironmentObject private var model: AppModel
  let result: MessageSearchResult?
  @State private var copiedAction: SearchResultCopyAction?
  @State private var copyResetTask: Task<Void, Never>?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      if let result {
        Divider()

        HStack(alignment: .top, spacing: 16) {
          VStack(alignment: .leading, spacing: 10) {
            Text("Selected Result")
              .font(.headline)

            ScrollView {
              VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                  PromptIntentBadge(key: result.promptIntentKey, label: result.promptIntent)
                  Label {
                    Text(result.project)
                      .lineLimit(1)
                      .truncationMode(.middle)
                  } icon: {
                    Image(systemName: "folder")
                  }
                  .font(.caption)
                  .foregroundStyle(.secondary)
                  Spacer(minLength: 8)
                  Text(formattedDate(result.timestamp))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                }
                HighlightedSearchText(
                  text: result.content,
                  query: model.messageQuery,
                  lineLimit: nil,
                  collapsesWhitespace: false
                )
                  .font(.body)
                  .textSelection(.enabled)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
              .padding(10)
              .promptIntentCardChrome(key: result.promptIntentKey)
            }
            .frame(maxWidth: .infinity, minHeight: 96, maxHeight: 220, alignment: .leading)
            .accessibilityIdentifier("selected-search-message-preview")

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .leading)], alignment: .leading, spacing: 8) {
              SearchResultMetadataItem(label: "Date/Time", value: formattedDate(result.timestamp))
              if let promptIntent = result.promptIntent, !promptIntent.isEmpty {
                SearchResultMetadataItem(label: "Category", value: promptIntent)
              }
              SearchResultMetadataItem(label: "Project", value: result.project)
              SearchResultMetadataItem(label: "Role", value: result.role.capitalized)
              SearchResultMetadataItem(label: "Session Day", value: result.dateKey ?? "")
              SearchResultMetadataItem(label: "Session ID", value: String(result.sessionId.prefix(8)))
            }
          }

          VStack(alignment: .leading, spacing: 8) {
            Button {
              model.selectSearchResult(result.id)
            } label: {
              Label("Show Conversation", systemImage: "text.bubble")
                .frame(width: searchResultActionLabelWidth, alignment: .leading)
            }
            .accessibilityIdentifier("open-search-result-button")

            Button {
              confirmCopy(.session) {
                model.copySearchResultSessionID(result)
              }
            } label: {
              CopyFeedbackLabel(
                title: "Copy Session ID",
                systemImage: "doc.on.doc",
                isCopied: copiedAction == .session
              )
            }
            .accessibilityIdentifier("copy-search-session-button")

            Button {
              confirmCopy(.project) {
                model.copySearchResultProject(result)
              }
            } label: {
              CopyFeedbackLabel(
                title: "Copy Project Name",
                systemImage: "folder",
                isCopied: copiedAction == .project
              )
            }
            .accessibilityIdentifier("copy-search-project-button")

            Button {
              confirmCopy(.snippet) {
                model.copySearchResultSnippet(result)
              }
            } label: {
              CopyFeedbackLabel(
                title: "Copy Matched Text",
                systemImage: "text.quote",
                isCopied: copiedAction == .snippet
              )
            }
            .accessibilityIdentifier("copy-search-snippet-button")
          }
          .frame(width: searchResultActionColumnWidth, alignment: .topLeading)
          .buttonStyle(.bordered)
        }
      } else {
        Divider()
        ContentUnavailableView(
          "No Result Selected",
          systemImage: "cursorarrow.click",
          description: Text("Select a search result to inspect the matched message.")
        )
        .frame(maxWidth: .infinity, minHeight: 120)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: result?.id) { _, _ in
      copyResetTask?.cancel()
      copiedAction = nil
    }
    .onDisappear {
      copyResetTask?.cancel()
    }
  }

  private func confirmCopy(_ action: SearchResultCopyAction, perform: () -> Void) {
    perform()
    copyResetTask?.cancel()
    withAnimation(.snappy(duration: 0.18)) {
      copiedAction = action
    }
    copyResetTask = Task {
      try? await Task.sleep(for: .seconds(1.4))
      guard !Task.isCancelled else { return }
      await MainActor.run {
        withAnimation(.easeOut(duration: 0.18)) {
          if copiedAction == action {
            copiedAction = nil
          }
        }
      }
    }
  }
}

struct HighlightedSearchText: View {
  let text: String
  let query: String
  let lineLimit: Int?
  let collapsesWhitespace: Bool

  var body: some View {
    highlightedText
      .lineLimit(lineLimit)
  }

  private var highlightedText: Text {
    guard let parts = highlightedParts else {
      return Text(displayText)
    }
    return Text(parts.prefix) + Text(parts.match).bold().foregroundColor(.yellow) + Text(parts.suffix)
  }

  private var displayText: String {
    if collapsesWhitespace {
      return Self.collapseWhitespace(text)
    } else {
      return text
    }
  }

  private var highlightedParts: (prefix: String, match: String, suffix: String)? {
    let trimmedQuery = Self.collapseWhitespace(query).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedQuery.isEmpty else {
      return nil
    }
    let range = collapsesWhitespace
      ? displayText.range(of: trimmedQuery, options: [.caseInsensitive, .diacriticInsensitive])
      : Self.whitespaceNormalizedRange(in: displayText, query: trimmedQuery)
    guard let range else { return nil }

    return (
      String(displayText[..<range.lowerBound]),
      String(displayText[range]),
      String(displayText[range.upperBound...])
    )
  }

  private static func collapseWhitespace(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func whitespaceNormalizedRange(in source: String, query: String) -> Range<String.Index>? {
    let normalizedQuery = collapseWhitespace(query).lowercased()
    guard !normalizedQuery.isEmpty else { return nil }

    var normalized = ""
    var sourceIndexes: [String.Index] = []
    var previousWasWhitespace = false
    var index = source.startIndex

    while index < source.endIndex {
      let character = source[index]
      if isWhitespace(character) {
        if !normalized.isEmpty && !previousWasWhitespace {
          normalized.append(" ")
          sourceIndexes.append(index)
        }
        previousWasWhitespace = true
      } else {
        let folded = String(character)
          .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
          .lowercased()
        normalized.append(folded)
        for _ in folded {
          sourceIndexes.append(index)
        }
        previousWasWhitespace = false
      }
      index = source.index(after: index)
    }

    while normalized.last == " " {
      normalized.removeLast()
      sourceIndexes.removeLast()
    }

    guard let normalizedRange = normalized.range(of: normalizedQuery) else {
      return nil
    }
    let lowerOffset = normalized.distance(from: normalized.startIndex, to: normalizedRange.lowerBound)
    let upperOffset = normalized.distance(from: normalized.startIndex, to: normalizedRange.upperBound)
    guard lowerOffset < sourceIndexes.count, upperOffset > lowerOffset else {
      return nil
    }

    let sourceLowerBound = sourceIndexes[lowerOffset]
    let sourceLastMatchIndex = sourceIndexes[min(upperOffset - 1, sourceIndexes.count - 1)]
    return sourceLowerBound..<source.index(after: sourceLastMatchIndex)
  }

  private static func isWhitespace(_ character: Character) -> Bool {
    character.unicodeScalars.allSatisfy { CharacterSet.whitespacesAndNewlines.contains($0) }
  }
}

private enum SearchResultCopyAction {
  case session
  case project
  case snippet
}

private let searchResultActionLabelWidth: CGFloat = 150
private let searchResultActionColumnWidth: CGFloat = 172

struct CopyFeedbackLabel: View {
  let title: String
  let systemImage: String
  let isCopied: Bool

  var body: some View {
    Label {
      Text(isCopied ? "Copied" : title)
        .contentTransition(.opacity)
    } icon: {
      Image(systemName: isCopied ? "checkmark.circle.fill" : systemImage)
        .foregroundStyle(isCopied ? .green : .primary)
        .scaleEffect(isCopied ? 1.08 : 1)
    }
    .frame(width: searchResultActionLabelWidth, alignment: .leading)
    .animation(.snappy(duration: 0.18), value: isCopied)
  }
}

struct SearchResultMetadataItem: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value.isEmpty ? "unknown" : value)
        .font(.caption)
        .lineLimit(1)
        .textSelection(.enabled)
    }
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
    return "Adjust the current filters."
  }

  var body: some View {
    let sessions = model.summary?.sessions ?? []

    GroupBox("Sessions") {
      VStack(alignment: .leading, spacing: 10) {
        Text("\(sessions.count.formatted()) visible")
          .font(.caption)
          .foregroundStyle(.secondary)

        if model.summary != nil {
          if sessions.isEmpty {
            ContentUnavailableView(
              emptySessionsTitle,
              systemImage: "tray",
              description: Text(emptySessionsDescription)
            )
            .frame(maxWidth: .infinity, minHeight: 280)
            .accessibilityIdentifier("sessions-empty-state")
          } else {
            Table(sessions, selection: $model.selectedSessionID) {
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
    model.searchResults.first { $0.id == model.selectedSearchResultID }
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
      (result.lineNumber == nil || message.lineNumber == result.lineNumber) &&
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
        if let promptIntent = result.promptIntent, !promptIntent.isEmpty {
          LabeledContent("Category", value: promptIntent)
        }
        LabeledContent("Project", value: result.project)
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
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            PromptIntentBadge(key: result.promptIntentKey, label: result.promptIntent)
            Label {
              Text(result.project)
                .lineLimit(1)
                .truncationMode(.middle)
            } icon: {
              Image(systemName: "folder")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            Spacer(minLength: 8)
            Text(formattedDate(result.timestamp))
              .font(.caption.monospacedDigit())
              .foregroundStyle(.secondary)
          }
          Text(result.content)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .promptIntentCardChrome(key: result.promptIntentKey)

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
  @EnvironmentObject private var model: AppModel

  let detail: SessionDetail
  var highlightedMessageIndex: Int?
  @State private var selectedUserMessageIndex: Int?

  private var sessionIdentity: String {
    "\(detail.file.filePath)#\(detail.file.sessionId)"
  }

  private var userMessages: [(offset: Int, element: MessageDetail)] {
    model.visibleUserMessageOffsets(in: detail, dateKey: model.selectedSessionDateKey)
  }

  private var allUserMessages: [(offset: Int, element: MessageDetail)] {
    SessionInteractionBuilder.userMessageOffsets(in: detail, dateKey: model.selectedSessionDateKey)
  }

  private var automationMessages: [(offset: Int, element: MessageDetail)] {
    Array(detail.messages.enumerated())
      .filter {
        $0.element.sourceEvent == "event_msg.automation_message" &&
          (model.selectedSessionDateKey == nil || codexLocalDateKey($0.element.timestamp) == model.selectedSessionDateKey)
      }
  }

  private var selectedInteraction: SessionInteraction? {
    guard let selectedUserMessageIndex else { return nil }
    return SessionInteractionBuilder.interaction(in: detail, selectedUserMessageIndex: selectedUserMessageIndex)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 14) {
        Label("User Messages", systemImage: "person.text.rectangle")
          .font(.title3)
          .fontWeight(.semibold)
        Text(sessionMessageCountLabel)
          .font(.caption)
          .foregroundStyle(.secondary)

        if userMessages.isEmpty {
          ContentUnavailableView(
            emptyUserMessagesTitle,
            systemImage: "text.bubble",
            description: Text(emptyUserMessagesDescription)
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

        if !automationMessages.isEmpty {
          DisclosureGroup("Automation Messages") {
            VStack(alignment: .leading, spacing: 8) {
              ForEach(automationMessages, id: \.offset) { item in
                automationMessageRow(message: item.element)
              }
            }
            .padding(.top, 6)
          }
        }

        if let selectedInteraction {
          Divider()
          CodexInteractionView(interaction: selectedInteraction)
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
      selectedUserMessageIndex = highlightedMessageIndex
    }
    .onChange(of: highlightedMessageIndex) { _, newValue in
      if let newValue {
        selectedUserMessageIndex = newValue
      }
    }
    .onAppear {
      if let highlightedMessageIndex {
        selectedUserMessageIndex = highlightedMessageIndex
      }
    }
  }

  private var sessionMessageCountLabel: String {
    let sent = "\(userMessages.count.formatted()) sent"
    let visiblePrefix = userMessages.count == allUserMessages.count
      ? sent
      : "\(userMessages.count.formatted()) visible of \(allUserMessages.count.formatted()) sent"
    guard !automationMessages.isEmpty else {
      return "\(visiblePrefix) in this session"
    }
    let automationLabel = automationMessages.count == 1 ? "automation" : "automations"
    return "\(visiblePrefix), \(automationMessages.count.formatted()) \(automationLabel) in this session"
  }

  private var emptyUserMessagesTitle: String {
    if allUserMessages.isEmpty {
      return automationMessages.isEmpty ? "No User Messages" : "No Sent Messages"
    }
    return "No Visible Messages"
  }

  private var emptyUserMessagesDescription: String {
    if allUserMessages.isEmpty {
      return automationMessages.isEmpty
        ? "This session has no submitted user messages."
        : "This session was started by automation."
    }
    return "Turn on at least one operational message family in the View menu."
  }

  private func userMessageRow(message: MessageDetail, isSelected: Bool) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        PromptIntentBadge(key: message.promptIntentKey, label: message.promptIntent)
        Text(formattedDate(message.timestamp))
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        Spacer(minLength: 8)
      }
      Text(messageDisplayText(message))
        .font(.body)
        .lineLimit(4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .promptIntentCardChrome(
      key: message.promptIntentKey,
      isSelected: isSelected,
      isHighlighted: highlightedMessageIndex == messageIndex(message)
    )
  }

  private func automationMessageRow(message: MessageDetail) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(formattedDate(message.timestamp))
        .font(.caption.monospacedDigit())
        .foregroundStyle(.secondary)
      Text(messageDisplayText(message))
        .font(.body)
        .lineLimit(4)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
  }

  private func messageIndex(_ message: MessageDetail) -> Int? {
    detail.messages.firstIndex(of: message)
  }
}

struct CodexInteractionView: View {
  let interaction: SessionInteraction

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label("Codex Interaction", systemImage: "text.bubble")
        .font(.title3)
        .fontWeight(.semibold)

      InteractionMessageCard(
        title: "User Message",
        subtitle: formattedDate(interaction.userMessage.timestamp),
        text: messageDisplayText(interaction.userMessage),
        tint: .green,
        promptIntentKey: interaction.userMessage.promptIntentKey,
        promptIntent: interaction.userMessage.promptIntent
      )

      InspectorSectionTitle("Codex Response")
      if interaction.assistantMessages.isEmpty {
        Text("No Codex response was found for this message.")
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(Array(interaction.assistantMessages.enumerated()), id: \.offset) { _, message in
            InteractionMessageCard(
              title: responseTitle(message),
              subtitle: formattedDate(message.timestamp),
              text: messageDisplayText(message),
              tint: .blue
            )
          }
        }
      }

      if !interaction.toolEvents.isEmpty {
        DisclosureGroup("Tool Activity (\(interaction.toolEvents.count.formatted()))") {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(interaction.toolEvents.enumerated()), id: \.offset) { _, event in
              ToolEventRow(event: event)
            }
          }
          .padding(.top, 6)
        }
      }

      if !interaction.contextMessages.isEmpty {
        DisclosureGroup("System / Developer Context (\(interaction.contextMessages.count.formatted()))") {
          VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(interaction.contextMessages.enumerated()), id: \.offset) { _, message in
              InteractionMessageCard(
                title: contextTitle(message),
                subtitle: formattedDate(message.timestamp),
                text: messageDisplayText(message),
                tint: contextTint(message),
                monospaced: true
              )
            }
          }
          .padding(.top, 6)
        }
      }

      if interaction.taskTiming != nil || !interaction.tokenUsage.isEmpty {
        TokenTimingSummary(interaction: interaction)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func responseTitle(_ message: MessageDetail) -> String {
    if let phase = message.phase, !phase.isEmpty {
      return "Codex Response - \(phase.replacingOccurrences(of: "_", with: " ").capitalized)"
    }
    return "Codex Response"
  }

  private func contextTitle(_ message: MessageDetail) -> String {
    switch message.role {
    case "system":
      return "System Message"
    case "developer":
      return "Developer Message"
    default:
      return message.role.capitalized
    }
  }

  private func contextTint(_ message: MessageDetail) -> Color {
    switch message.role {
    case "system":
      return .orange
    case "developer":
      return .purple
    default:
      return .secondary
    }
  }
}

struct InteractionMessageCard: View {
  let title: String
  let subtitle: String
  let text: String
  let tint: Color
  var promptIntentKey: String?
  var promptIntent: String?
  var monospaced = false

  private var bodyFont: Font {
    monospaced ? .system(.body, design: .monospaced) : .body
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(title)
          .font(.caption)
          .fontWeight(.semibold)
          .foregroundStyle(tint)
        PromptIntentBadge(key: promptIntentKey, label: promptIntent)
        Spacer()
        Text(subtitle)
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      Text(text)
        .font(bodyFont)
        .textSelection(.enabled)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 8))
    .overlay(alignment: .leading) {
      Rectangle()
        .fill(tint.opacity(0.65))
        .frame(width: 3)
    }
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}

struct ToolEventRow: View {
  let event: ToolEventDetail

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Image(systemName: iconName)
        .foregroundStyle(.purple)
        .frame(width: 18)
      VStack(alignment: .leading, spacing: 3) {
        Text(title)
          .font(.caption)
          .fontWeight(.semibold)
        if !detailText.isEmpty {
          Text(detailText)
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        if let content = event.content?.trimmingCharacters(in: .whitespacesAndNewlines), !content.isEmpty {
          Text(content)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(.secondary)
            .lineLimit(4)
            .textSelection(.enabled)
        }
      }
      Spacer()
    }
    .padding(8)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
  }

  private var title: String {
    event.name ?? event.eventType.replacingOccurrences(of: "_", with: " ").capitalized
  }

  private var detailText: String {
    [
      formattedDate(event.timestamp),
      event.exitCode.map { "exit \($0)" },
      event.durationMs.map { "\(Int($0).formatted()) ms" },
      event.cwd
    ]
    .compactMap { $0 }
    .filter { !$0.isEmpty }
    .joined(separator: " | ")
  }

  private var iconName: String {
    switch event.eventType {
    case "exec_command_end":
      return "terminal"
    case "patch_apply_end":
      return "hammer"
    case "custom_tool_call", "function_call":
      return "wrench.and.screwdriver"
    default:
      return "gearshape"
    }
  }
}

struct TokenTimingSummary: View {
  let interaction: SessionInteraction

  private var usage: TokenUsage? {
    interaction.tokenUsage.last?.usage
  }

  var body: some View {
    GroupBox("Tokens And Timing") {
      HStack(spacing: 12) {
        if let usage {
          CompactStat(label: "Input", value: usage.inputTokens)
          CompactStat(label: "Output", value: usage.outputTokens)
          CompactStat(label: "Reasoning", value: usage.reasoningOutputTokens)
        }
        if let timing = interaction.taskTiming {
          CompactDurationStat(label: "Duration", milliseconds: timing.durationMs)
          CompactDurationStat(label: "First Token", milliseconds: timing.timeToFirstTokenMs)
        }
        Spacer()
      }
      .padding(.vertical, 4)
    }
  }
}

struct CompactStat: View {
  let label: String
  let value: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value.formatted())
        .font(.caption.monospacedDigit())
        .fontWeight(.semibold)
    }
  }
}

struct CompactDurationStat: View {
  let label: String
  let milliseconds: Double?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(durationText)
        .font(.caption.monospacedDigit())
        .fontWeight(.semibold)
    }
  }

  private var durationText: String {
    guard let milliseconds else { return "unknown" }
    if milliseconds >= 1000 {
      return "\(String(format: "%.1f", milliseconds / 1000)) s"
    }
    return "\(Int(milliseconds).formatted()) ms"
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
  guard let date = parsedISODate(value) else { return value ?? "" }

  return date.formatted(date: .abbreviated, time: .shortened)
}

func compactFormattedDate(_ value: String?) -> String {
  guard let date = parsedISODate(value) else { return value ?? "" }

  return date.formatted(.dateTime.month(.twoDigits).day().year(.twoDigits).hour().minute())
}

private func parsedISODate(_ value: String?) -> Date? {
  guard let value, !value.isEmpty else { return nil }

  let fractionalFormatter = ISO8601DateFormatter()
  fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = fractionalFormatter.date(from: value) {
    return date
  }

  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  if let date = formatter.date(from: value) {
    return date
  }

  return nil
}
