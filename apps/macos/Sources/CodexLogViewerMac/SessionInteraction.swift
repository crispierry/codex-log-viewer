import Foundation

private let codexFractionalISOFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter
}()

private let codexPlainISOFormatter: ISO8601DateFormatter = {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter
}()

private let codexDateKeyFormatter: DateFormatter = {
  let formatter = DateFormatter()
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.dateFormat = "yyyy-MM-dd"
  return formatter
}()

struct SessionInteraction: Equatable {
  let userMessageIndex: Int
  let userMessage: MessageDetail
  let assistantMessages: [MessageDetail]
  let contextMessages: [MessageDetail]
  let toolEvents: [ToolEventDetail]
  let tokenUsage: [TokenUsageDetail]
  let taskTiming: TaskTimingDetail?
}

enum SessionInteractionBuilder {
  static func userMessageOffsets(in detail: SessionDetail, dateKey: String? = nil) -> [(offset: Int, element: MessageDetail)] {
    Array(detail.messages.enumerated())
      .filter {
        isSubmittedUserMessage($0.element) &&
          (dateKey == nil || codexLocalDateKey($0.element.timestamp) == dateKey)
      }
  }

  static func interaction(in detail: SessionDetail, selectedUserMessageIndex: Int) -> SessionInteraction? {
    guard detail.messages.indices.contains(selectedUserMessageIndex) else { return nil }

    let selectedMessage = detail.messages[selectedUserMessageIndex]
    guard isSubmittedUserMessage(selectedMessage) else { return nil }

    let nextPromptIndex = detail.messages
      .dropFirst(selectedUserMessageIndex + 1)
      .firstIndex { isPromptBoundary($0) }
    let nextPromptLine = nextPromptIndex.flatMap { detail.messages[$0].lineNumber }

    let relatedMessages = detail.messages.enumerated().filter { item in
      let offset = item.offset
      let message = item.element
      guard offset != selectedUserMessageIndex, !isPromptBoundary(message) else { return false }
      return belongsToInteraction(
        turnId: message.turnId,
        lineNumber: message.lineNumber,
        offset: offset,
        selectedMessage: selectedMessage,
        selectedIndex: selectedUserMessageIndex,
        nextPromptIndex: nextPromptIndex,
        nextPromptLine: nextPromptLine
      )
    }.map(\.element)

    let assistantMessages = uniqueMessages(
      relatedMessages.filter { $0.role == "assistant" && !messageDisplayText($0).isEmpty }
    )
    let contextMessages = uniqueMessages(
      relatedMessages.filter { $0.role != "assistant" && !messageDisplayText($0).isEmpty }
    )
    let relatedToolEvents = detail.toolEvents.filter { event in
      belongsToInteraction(
        turnId: event.turnId,
        lineNumber: event.lineNumber,
        offset: nil,
        selectedMessage: selectedMessage,
        selectedIndex: selectedUserMessageIndex,
        nextPromptIndex: nextPromptIndex,
        nextPromptLine: nextPromptLine
      )
    }
    let relatedTokenUsage = detail.tokenUsage.filter { token in
      belongsToInteraction(
        turnId: token.turnId,
        lineNumber: token.lineNumber,
        offset: nil,
        selectedMessage: selectedMessage,
        selectedIndex: selectedUserMessageIndex,
        nextPromptIndex: nextPromptIndex,
        nextPromptLine: nextPromptLine
      )
    }
    let timing = selectedMessage.turnId.flatMap { turnId in
      detail.taskTimings.first { $0.turnId == turnId }
    }

    return SessionInteraction(
      userMessageIndex: selectedUserMessageIndex,
      userMessage: selectedMessage,
      assistantMessages: assistantMessages,
      contextMessages: contextMessages,
      toolEvents: relatedToolEvents,
      tokenUsage: relatedTokenUsage,
      taskTiming: timing
    )
  }

  private static func belongsToInteraction(
    turnId: String?,
    lineNumber: Int?,
    offset: Int?,
    selectedMessage: MessageDetail,
    selectedIndex: Int,
    nextPromptIndex: Int?,
    nextPromptLine: Int?
  ) -> Bool {
    if let selectedTurnId = selectedMessage.turnId, turnId == selectedTurnId {
      if let selectedLine = selectedMessage.lineNumber, let lineNumber {
        return lineNumber > selectedLine && (nextPromptLine.map { lineNumber < $0 } ?? true)
      }
      if let offset {
        return offset > selectedIndex && (nextPromptIndex.map { offset < $0 } ?? true)
      }
      return true
    }

    if let selectedLine = selectedMessage.lineNumber, let lineNumber {
      return lineNumber > selectedLine && (nextPromptLine.map { lineNumber < $0 } ?? true)
    }

    if let offset {
      return offset > selectedIndex && (nextPromptIndex.map { offset < $0 } ?? true)
    }

    return false
  }

  private static func isPromptBoundary(_ message: MessageDetail) -> Bool {
    isSubmittedUserMessage(message) || message.sourceEvent == "event_msg.automation_message"
  }

  private static func uniqueMessages(_ messages: [MessageDetail]) -> [MessageDetail] {
    var seen = Set<String>()
    return messages.filter { message in
      seen.insert(messageDisplayText(message)).inserted
    }
  }
}

func isSubmittedUserMessage(_ message: MessageDetail) -> Bool {
  message.role == "user" && (
    message.sourceEvent == "event_msg.user_message" ||
      message.sourceEvent == "claude.user_message" ||
      message.sourceEvent == "cursor.user_message"
  )
}

func messageDisplayText(_ message: MessageDetail) -> String {
  let text = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
  return text.isEmpty ? message.sourceEvent : text
}

func codexLocalDateKey(_ value: String?) -> String? {
  guard let value, !value.isEmpty else { return nil }
  guard let date = codexFractionalISOFormatter.date(from: value) ?? codexPlainISOFormatter.date(from: value) else {
    return nil
  }
  return codexDateKeyFormatter.string(from: date)
}
