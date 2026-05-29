import SwiftUI

struct EvalsWindowRootView: View {
  @ObservedObject var appDelegate: AppDelegate

  var body: some View {
    if let model = appDelegate.commandModel {
      EvalsPanelView(model: model)
    } else {
      Text("Open Codex Log Viewer first.")
        .padding(18)
        .frame(width: 300)
    }
  }
}

struct EvalsPanelView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    HStack(spacing: 0) {
      EvalsCategorySidebar(model: model)
        .frame(width: 260)
      Divider()
      EvalsMessageList(model: model)
        .frame(minWidth: 420)
      Divider()
      EvalsInspector(model: model)
        .frame(width: 380)
    }
    .frame(minWidth: 1_080, minHeight: 660)
    .task {
      model.loadEvals(selectFirstIfNeeded: true)
    }
  }
}

private struct EvalsCategorySidebar: View {
  @ObservedObject var model: AppModel

  private var summary: PromptIntentEvalSummary? {
    model.evalsSummary?.summary
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Evals")
        .font(.title3)
        .fontWeight(.semibold)

      Picker("Review", selection: Binding(
        get: { model.evalReviewStateFilter },
        set: { model.setEvalReviewStateFilter($0) }
      )) {
        ForEach(EvalReviewStateFilter.allCases) { state in
          Text(state.label).tag(state)
        }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .accessibilityIdentifier("eval-review-state-picker")

      EvalsSidebarButton(
        title: "All Categories",
        count: summary?.totalMessages ?? 0,
        reviewed: summary?.reviewedMessages ?? 0,
        incorrect: summary?.incorrectMessages ?? 0,
        isSelected: model.evalCategoryKeyFilter == nil
      ) {
        model.setEvalCategoryFilter(nil)
      }
      .accessibilityIdentifier("eval-category-all")

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 6) {
          ForEach(summary?.categories ?? []) { category in
            EvalsSidebarButton(
              title: category.label,
              count: category.total,
              reviewed: category.reviewed,
              incorrect: category.incorrect,
              isSelected: model.evalCategoryKeyFilter == category.key
            ) {
              model.setEvalCategoryFilter(category.key)
            }
            .accessibilityIdentifier("eval-category-\(category.key)")
          }
        }
      }

      Spacer(minLength: 8)

      if let summary {
        VStack(alignment: .leading, spacing: 5) {
          Text("\(summary.reviewedMessages.formatted()) reviewed")
          Text("\(summary.correctMessages.formatted()) correct")
          Text("\(summary.incorrectMessages.formatted()) incorrect")
          Text(summary.reviewedAccuracy.map { "\(($0 * 100).formatted(.number.precision(.fractionLength(1))))% accuracy" } ?? "No reviewed accuracy")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .monospacedDigit()
      }
    }
    .padding(14)
  }
}

private struct EvalsSidebarButton: View {
  let title: String
  let count: Int
  let reviewed: Int
  let incorrect: Int
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(title)
            .font(.subheadline)
            .fontWeight(.semibold)
            .lineLimit(1)
          Spacer(minLength: 8)
          Text(count.formatted())
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        HStack(spacing: 8) {
          Text("\(reviewed.formatted()) reviewed")
          if incorrect > 0 {
            Text("\(incorrect.formatted()) incorrect")
              .foregroundStyle(.red)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(isSelected ? Color.accentColor.opacity(0.16) : Color.clear, in: RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
  }
}

private struct EvalsMessageList: View {
  @ObservedObject var model: AppModel
  @FocusState private var isSearchFocused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack {
        Text("Messages")
          .font(.title3)
          .fontWeight(.semibold)
        Spacer()
        if model.isEvalsLoading {
          ProgressView()
            .controlSize(.small)
        }
        Button {
          model.loadEvals(selectFirstIfNeeded: false)
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .help("Refresh evals")
        .accessibilityIdentifier("eval-refresh-button")
      }

      HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
          .foregroundStyle(.secondary)
        TextField("Search messages", text: $model.evalQuery)
          .textFieldStyle(.plain)
          .focused($isSearchFocused)
          .onSubmit {
            model.loadEvals(selectFirstIfNeeded: true)
          }
        Button {
          model.loadEvals(selectFirstIfNeeded: true)
        } label: {
          Image(systemName: "arrow.right.circle")
        }
        .help("Run eval search")
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
      .accessibilityIdentifier("eval-search-field")

      if let evals = model.evalsSummary {
        Text("\(evals.totalMatches.formatted()) visible of \(evals.summary.totalMessages.formatted()) submitted messages")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if let message = model.evalsStatusMessage {
        Text(message)
          .font(.caption)
          .foregroundStyle(.red)
      }

      if model.evalMessages.isEmpty {
        ContentUnavailableView("No Eval Messages", systemImage: "checklist", description: Text("No submitted messages match the current filters."))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        List(model.evalMessages, selection: $model.selectedEvalMessageID) { message in
          EvalsMessageRow(message: message)
            .tag(message.id)
        }
        .listStyle(.plain)
        .accessibilityIdentifier("eval-message-list")
        .onChange(of: model.selectedEvalMessageID) { _, newValue in
          model.selectEvalMessage(newValue)
        }
      }
    }
    .padding(14)
  }
}

private struct EvalsMessageRow: View {
  let message: PromptIntentEvalMessage

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        PromptIntentBadge(key: message.promptIntentKey, label: message.promptIntent)
        Text(message.confidence.capitalized)
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer(minLength: 8)
        reviewBadge
      }
      Text(message.snippet)
        .font(.body)
        .lineLimit(3)
      HStack(spacing: 8) {
        Text(message.project)
        Text(compactFormattedDate(message.timestamp))
        Text(message.ruleKey)
      }
      .font(.caption)
      .foregroundStyle(.secondary)
      .lineLimit(1)
    }
    .padding(.vertical, 6)
  }

  @ViewBuilder private var reviewBadge: some View {
    if let review = message.review {
      Text(review.isCorrect ? "Correct" : "Incorrect")
        .font(.caption)
        .fontWeight(.semibold)
        .foregroundStyle(review.isCorrect ? .green : .red)
    } else {
      Text("Unreviewed")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct EvalsInspector: View {
  @ObservedObject var model: AppModel
  @State private var expectedKey = ""

  private var selected: PromptIntentEvalMessage? {
    model.selectedEvalMessage
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Review")
        .font(.title3)
        .fontWeight(.semibold)

      if let selected {
        ScrollView {
          VStack(alignment: .leading, spacing: 12) {
            HStack {
              PromptIntentBadge(key: selected.promptIntentKey, label: selected.promptIntent)
              Spacer()
              Text(formattedDate(selected.timestamp))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            }

            Text(selected.content)
              .textSelection(.enabled)
              .frame(maxWidth: .infinity, alignment: .leading)

            Divider()

            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
              GridRow {
                Text("Rule")
                  .foregroundStyle(.secondary)
                Text(selected.ruleLabel)
              }
              GridRow {
                Text("Rule Key")
                  .foregroundStyle(.secondary)
                Text(selected.ruleKey)
              }
              GridRow {
                Text("Confidence")
                  .foregroundStyle(.secondary)
                Text(selected.confidence.capitalized)
              }
              GridRow {
                Text("Project")
                  .foregroundStyle(.secondary)
                Text(selected.project)
                  .lineLimit(1)
                  .truncationMode(.middle)
              }
              GridRow {
                Text("Session")
                  .foregroundStyle(.secondary)
                Text(String(selected.sessionId.prefix(8)))
                  .font(.body.monospacedDigit())
              }
            }
            .font(.caption)

            if !selected.signals.isEmpty {
              Text(selected.signals.joined(separator: ", "))
                .font(.caption)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            }

            Divider()

            Button {
              model.markSelectedEvalCorrect()
            } label: {
              Label("Correct", systemImage: "checkmark.circle")
            }
            .accessibilityIdentifier("eval-mark-correct-button")

            Picker("Expected", selection: $expectedKey) {
              ForEach(model.promptIntentCategoryOptions) { category in
                Text(category.label).tag(category.key)
              }
            }
            .accessibilityIdentifier("eval-expected-category-picker")

            TextEditor(text: $model.evalReviewNote)
              .font(.body)
              .frame(minHeight: 76)
              .overlay {
                RoundedRectangle(cornerRadius: 8)
                  .stroke(Color.primary.opacity(0.12), lineWidth: 1)
              }
              .accessibilityIdentifier("eval-review-note")

            HStack {
              Button {
                model.saveEvalReview(for: selected, expectedKey: expectedKey, note: model.evalReviewNote)
              } label: {
                Label("Save Judgment", systemImage: "square.and.arrow.down")
              }
              .accessibilityIdentifier("eval-save-review-button")

              if selected.review != nil {
                Button {
                  model.clearEvalReview(selected)
                } label: {
                  Label("Clear Review", systemImage: "xmark.circle")
                }
                .accessibilityIdentifier("eval-clear-review-button")
              }
            }

            Button {
              model.showConversation(for: selected)
            } label: {
              Label("Show Conversation", systemImage: "text.bubble")
            }
            .accessibilityIdentifier("eval-show-conversation-button")
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } else {
        ContentUnavailableView("No Message Selected", systemImage: "checklist")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .padding(14)
    .onChange(of: selected?.id) { _, _ in
      expectedKey = selected?.review?.expectedKey ?? selected?.promptIntentKey ?? model.promptIntentCategoryOptions.first?.key ?? ""
    }
    .onAppear {
      expectedKey = selected?.review?.expectedKey ?? selected?.promptIntentKey ?? model.promptIntentCategoryOptions.first?.key ?? ""
    }
  }
}
