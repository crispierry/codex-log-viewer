import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCodexCorpus } from "@codex-log-viewer/parser";
import { projectsFromCorpus, redactedProjectSummary, searchMessages, summarizeParsedCorpus, summaryToJson } from "../dist/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(testDir, "../../../fixtures/codex/sample-session.jsonl");

test("summarizeParsedCorpus aggregates messages, unique messages, tokens, models, and warnings", async () => {
  const corpus = await parseCodexCorpus({ paths: [fixturePath] });
  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });

  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.totals.userMessages, 1);
  assert.equal(summary.totals.automationMessages, 0);
  assert.equal(summary.totals.uniqueUserMessages, 1);
  assert.equal(summary.tokens.totalTokens, 17277);
  assert.equal(summary.tokens.freshInputTokens, 10280);
  assert.equal(summary.models[0]?.model, "gpt-5.5");
  assert.equal(summary.totals.unknownEvents, 1);
  assert.equal(summary.totals.parseWarnings, 1);
  assert.equal(summary.messagesByDay[0]?.count, 1);
  assert.equal(summary.activity.firstSeen, "2026-04-27T19:01:00.745Z");
  assert.equal(summary.activity.lastSeen, "2026-04-27T19:01:12.000Z");

  const projects = projectsFromCorpus(corpus);
  assert.equal(projects[0]?.firstSeen, "2026-04-27T19:01:00.745Z");
  assert.equal(projects[0]?.lastSeen, "2026-04-27T19:01:12.000Z");
});

test("projectsFromCorpus uses token and turn timestamps for activity metadata", () => {
  const file = {
    filePath: "activity.jsonl",
    sessionId: "activity-session",
    lineCount: 4,
    sessions: [
      {
        filePath: "activity.jsonl",
        sessionId: "activity-session",
        cwd: "/tmp/activity-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    ],
    turns: [
      {
        filePath: "activity.jsonl",
        sessionId: "activity-session",
        turnId: "activity-turn",
        timestamp: "2026-01-01T00:02:00.000Z"
      }
    ],
    messages: [
      {
        filePath: "activity.jsonl",
        sessionId: "activity-session",
        timestamp: "2026-01-01T00:01:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "Sort project activity",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [
      {
        filePath: "activity.jsonl",
        sessionId: "activity-session",
        turnId: "activity-turn",
        timestamp: "2026-01-01T00:03:00.000Z",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          freshInputTokens: 10,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          totalTokens: 15
        }
      }
    ],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };
  const corpus = {
    files: [file],
    sessions: file.sessions,
    turns: file.turns,
    messages: file.messages,
    tokenUsage: file.tokenUsage,
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const projects = projectsFromCorpus(corpus);

  assert.equal(projects[0]?.firstSeen, "2026-01-01T00:00:00.000Z");
  assert.equal(projects[0]?.lastSeen, "2026-01-01T00:03:00.000Z");
});

test("summarizeParsedCorpus groups repeated user prompts without exposing them in redacted exports", () => {
  const corpus = {
    files: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-02T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "Please make the parser stricter",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        timestamp: "2026-01-02T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "Please   make\n\nthe parser stricter",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        timestamp: "2026-01-02T00:01:00.000Z",
        role: "assistant",
        sourceEvent: "response_item.message",
        content: "Done",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  const repeated = summary.repeatedUserMessages[0];
  const redacted = redactedProjectSummary(summary);

  assert.equal(summary.repeatedUserMessages.length, 1);
  assert.equal(repeated?.sample, "Please make the parser stricter");
  assert.equal(repeated?.count, 2);
  assert.equal(repeated?.sessionCount, 2);
  assert.deepEqual(repeated?.projects, ["sample-app"]);
  assert.deepEqual(
    repeated?.variants.map((variant) => [variant.sample, variant.count]),
    [["Please make the parser stricter", 2]]
  );
  assert.equal(redacted.repeatedUserMessages[0]?.id, "[redacted]");
  assert.equal(redacted.repeatedUserMessages[0]?.sample, "[redacted]");
  assert.equal(redacted.repeatedUserMessages[0]?.variants[0]?.sample, "[redacted]");
  assert.equal(redacted.promptIntents.buckets[0]?.examples[0], "[redacted]");
});

test("summarizeParsedCorpus groups command-style prompt families", () => {
  const message = ({ content, timestamp }, index) => ({
    filePath: `session-${index}.jsonl`,
    sessionId: `session-${index}`,
    timestamp,
    role: "user",
    sourceEvent: "event_msg.user_message",
    content,
    imagesCount: 0,
    localImagesCount: 0
  });
  const messages = [
    message({ content: "commit", timestamp: "2026-01-01T00:00:00.000Z" }, 1),
    message({ content: "commit and push", timestamp: "2026-01-01T00:01:00.000Z" }, 2),
    message({ content: "push", timestamp: "2026-01-01T00:02:00.000Z" }, 3),
    message({ content: "close work tree", timestamp: "2026-01-01T00:03:00.000Z" }, 4),
    message({ content: "create a new branch", timestamp: "2026-01-01T00:04:00.000Z" }, 5),
    message({ content: "Can you make a commit please", timestamp: "2026-01-01T00:05:00.000Z" }, 6),
    message({ content: "publish", timestamp: "2026-01-01T00:06:00.000Z" }, 7),
    message({ content: "Deploy to production", timestamp: "2026-01-01T00:07:00.000Z" }, 8),
    message({ content: "publish to origin", timestamp: "2026-01-01T00:08:00.000Z" }, 9),
    message({ content: "run the app", timestamp: "2026-01-01T00:09:00.000Z" }, 10),
    message({ content: "start the server", timestamp: "2026-01-01T00:10:00.000Z" }, 11),
    message({ content: "OK open the app for me", timestamp: "2026-01-01T00:11:00.000Z" }, 12),
    message({ content: "Are all files committed?", timestamp: "2026-01-01T00:12:00.000Z" }, 13),
    message({ content: "Have all changes been pushed?", timestamp: "2026-01-01T00:13:00.000Z" }, 14),
    message({ content: "is repo clean?", timestamp: "2026-01-01T00:14:00.000Z" }, 15),
    message({ content: "anything uncommitted?", timestamp: "2026-01-01T00:15:00.000Z" }, 16),
    message({ content: "do a code review", timestamp: "2026-01-01T00:16:00.000Z" }, 17),
    message({ content: "review the diff", timestamp: "2026-01-01T00:17:00.000Z" }, 18),
    message({ content: "inspect the changes", timestamp: "2026-01-01T00:18:00.000Z" }, 19),
    message({ content: "build the app", timestamp: "2026-01-01T00:19:00.000Z" }, 20),
    message({ content: "relaunch the packaged app", timestamp: "2026-01-01T00:20:00.000Z" }, 21),
    message({ content: "run the accessibility check", timestamp: "2026-01-01T00:21:00.000Z" }, 22),
    message({ content: "rerun smoke test", timestamp: "2026-01-01T00:22:00.000Z" }, 23)
  ];
  const corpus = {
    files: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      lineCount: 1,
      sessions: [],
      turns: [],
      messages: [],
      tokenUsage: [],
      taskTimings: [],
      toolEvents: [],
      unknownEvents: [],
      warnings: []
    })),
    sessions: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      cwd: "/tmp/sample-app",
      timestamp: item.timestamp
    })),
    turns: [],
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  assert.equal(summary.totals.userMessages, 23);
  assert.equal(summary.totals.uniqueUserMessages, 4);
  assert.equal(summary.messagesByDay[0]?.uniqueCount, 4);

  const gitGroup = summary.repeatedUserMessages.find((group) => group.sample === "Git commands");
  assert.equal(gitGroup?.count, 10);
  assert.deepEqual(
    gitGroup?.variants.map((variant) => variant.sample),
    [
      "anything uncommitted?",
      "is repo clean?",
      "Have all changes been pushed?",
      "Are all files committed?",
      "Can you make a commit please",
      "create a new branch",
      "close work tree",
      "push",
      "commit and push",
      "commit"
    ]
  );

  const deployGroup = summary.repeatedUserMessages.find((group) => group.sample === "Deploy/release/run/build");
  assert.equal(deployGroup?.count, 8);
  assert.deepEqual(
    deployGroup?.variants.map((variant) => variant.sample),
    [
      "relaunch the packaged app",
      "build the app",
      "OK open the app for me",
      "start the server",
      "run the app",
      "publish to origin",
      "Deploy to production",
      "publish"
    ]
  );

  const codeReviewGroup = summary.repeatedUserMessages.find((group) => group.sample === "Code review/QA");
  assert.equal(codeReviewGroup?.count, 3);
  assert.deepEqual(
    codeReviewGroup?.variants.map((variant) => variant.sample),
    ["inspect the changes", "review the diff", "do a code review"]
  );

  const testingGroup = summary.repeatedUserMessages.find((group) => group.sample === "Testing/verification");
  assert.equal(testingGroup?.count, 2);
  assert.deepEqual(
    testingGroup?.variants.map((variant) => variant.sample),
    ["rerun smoke test", "run the accessibility check"]
  );

  const search = searchMessages(corpus, { query: "", role: "user", submittedOnly: true });
  assert.equal(search.results.find((result) => result.content === "do a code review")?.category, "Code review/QA");
  assert.equal(search.results.find((result) => result.content === "do a code review")?.promptIntent, "Code review/QA");
  assert.equal(search.results.find((result) => result.content === "publish")?.category, "Deploy/release/run/build");
  assert.equal(search.results.find((result) => result.content === "publish")?.promptIntent, "Deploy/release/run/build");
  assert.equal(search.results.find((result) => result.content === "build the app")?.category, "Deploy/release/run/build");
  assert.equal(search.results.find((result) => result.content === "run the accessibility check")?.category, "Testing/verification");

  const filteredSearch = searchMessages(corpus, {
    query: "",
    role: "user",
    submittedOnly: true,
    hiddenCategories: ["Code review/QA", "Deploy/release/run/build"]
  });
  assert.equal(filteredSearch.totalMatches, 12);
  assert.equal(filteredSearch.results.some((result) => result.category === "Code review/QA"), false);
  assert.equal(filteredSearch.results.some((result) => result.category === "Deploy/release/run/build"), false);

  const allOperationalFilteredSearch = searchMessages(corpus, {
    query: "",
    role: "user",
    submittedOnly: true,
    hiddenCategories: [
      "Code review/QA",
      "Deploy/release/run/build",
      "Git commands",
      "Plan approvals",
      "Testing/verification"
    ]
  });
  assert.equal(allOperationalFilteredSearch.totalMatches, 0);
});

test("summarizeParsedCorpus groups short plan approval prompt families", () => {
  const message = ({ content, timestamp }, index) => ({
    filePath: `approval-session-${index}.jsonl`,
    sessionId: `approval-session-${index}`,
    timestamp,
    role: "user",
    sourceEvent: "event_msg.user_message",
    content,
    imagesCount: 0,
    localImagesCount: 0
  });
  const messages = [
    message({ content: "yes", timestamp: "2026-01-01T00:00:00.000Z" }, 1),
    message({ content: "Yes please.", timestamp: "2026-01-01T00:01:00.000Z" }, 2),
    message({ content: "yeah", timestamp: "2026-01-01T00:02:00.000Z" }, 3),
    message({ content: "go ahead", timestamp: "2026-01-01T00:03:00.000Z" }, 4),
    message({ content: "sounds good", timestamp: "2026-01-01T00:04:00.000Z" }, 5),
    message({ content: "Execute", timestamp: "2026-01-01T00:05:00.000Z" }, 6),
    message({ content: "Do that", timestamp: "2026-01-01T00:06:00.000Z" }, 7),
    message({ content: "execute the plan", timestamp: "2026-01-01T00:07:00.000Z" }, 8),
    message({ content: "yes, also add filtering", timestamp: "2026-01-01T00:08:00.000Z" }, 9)
  ];
  const corpus = {
    files: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      lineCount: 1,
      sessions: [],
      turns: [],
      messages: [],
      tokenUsage: [],
      taskTimings: [],
      toolEvents: [],
      unknownEvents: [],
      warnings: []
    })),
    sessions: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      cwd: "/tmp/sample-app",
      timestamp: item.timestamp
    })),
    turns: [],
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  assert.equal(summary.totals.userMessages, 9);
  assert.equal(summary.totals.uniqueUserMessages, 2);
  assert.equal(summary.messagesByDay[0]?.uniqueCount, 2);

  const approvalGroup = summary.repeatedUserMessages.find((group) => group.sample === "Plan approvals");
  assert.equal(approvalGroup?.category, "Plan approvals");
  assert.equal(approvalGroup?.count, 8);
  assert.deepEqual(
    approvalGroup?.variants.map((variant) => variant.sample),
    ["execute the plan", "Do that", "Execute", "sounds good", "go ahead", "yeah", "Yes please.", "yes"]
  );

  const filteredSearch = searchMessages(corpus, {
    query: "",
    role: "user",
    submittedOnly: true,
    hiddenCategories: ["Plan approvals"]
  });
  assert.equal(filteredSearch.totalMatches, 1);
  assert.equal(filteredSearch.results[0]?.content, "yes, also add filtering");
  assert.equal(filteredSearch.results[0]?.promptIntent, "Feature design");
});

test("summarizeParsedCorpus classifies project focus prompt intents accurately", () => {
  const message = ({ content, timestamp }, index) => ({
    filePath: `intent-session-${index}.jsonl`,
    sessionId: `intent-session-${index}`,
    timestamp,
    role: "user",
    sourceEvent: "event_msg.user_message",
    content,
    imagesCount: 0,
    localImagesCount: 0
  });
  const messages = [
    message(
      {
        content: "Act as a principal designer and improve the visibility of this section",
        timestamp: "2026-01-01T12:00:00.000Z"
      },
      1
    ),
    message({ content: "Fix this broken date picker bug", timestamp: "2026-01-01T12:01:00.000Z" }, 2),
    message({ content: "push to origin", timestamp: "2026-01-01T12:02:00.000Z" }, 3),
    message({ content: "Deploy to production", timestamp: "2026-01-01T12:03:00.000Z" }, 4),
    message({ content: "relaunch the packaged app", timestamp: "2026-01-01T12:04:00.000Z" }, 5),
    message({ content: "do a code review", timestamp: "2026-01-01T12:05:00.000Z" }, 6),
    message({ content: "investigate why the cache is stale", timestamp: "2026-01-01T12:06:00.000Z" }, 7),
    message({ content: "update the usage guide", timestamp: "2026-01-01T12:07:00.000Z" }, 8),
    message({ content: "run the accessibility check", timestamp: "2026-01-01T12:08:00.000Z" }, 9),
    message({ content: "declutter the sidebar", timestamp: "2026-01-01T12:09:00.000Z" }, 10),
    message({ content: "Do that", timestamp: "2026-01-01T12:10:00.000Z" }, 11),
    message({ content: "thanks for the update", timestamp: "2026-01-01T12:11:00.000Z" }, 12),
    message({ content: "Please implement this", timestamp: "2026-01-01T12:12:00.000Z" }, 13),
    message({ content: "Do we need the sessions column?", timestamp: "2026-01-01T12:13:00.000Z" }, 14),
    message({ content: "Generate a logo image", timestamp: "2026-01-01T12:14:00.000Z" }, 15),
    message({ content: "Show the metrics as a pie chart", timestamp: "2026-01-01T12:15:00.000Z" }, 16),
    message({ content: "publish the release", timestamp: "2026-01-02T12:00:00.000Z" }, 17)
  ];
  const corpus = {
    files: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      lineCount: 1,
      sessions: [],
      turns: [],
      messages: [],
      tokenUsage: [],
      taskTimings: [],
      toolEvents: [],
      unknownEvents: [],
      warnings: []
    })),
    sessions: messages.map((item) => ({
      filePath: item.filePath,
      sessionId: item.sessionId,
      cwd: "/tmp/sample-app",
      timestamp: item.timestamp
    })),
    turns: [],
    messages,
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, {
    project: "sample-app",
    since: "2026-01-01",
    until: "2026-01-01"
  });
  const buckets = new Map(summary.promptIntents.buckets.map((bucket) => [bucket.label, bucket]));

  assert.equal(summary.promptIntents.totalMessages, 16);
  assert.equal(summary.promptIntents.classifiedMessages, 16);
  assert.equal(summary.promptIntents.unclassifiedMessages, 0);
  assert.equal(buckets.get("Feature design")?.count, 1);
  assert.equal(buckets.get("Bug fixes")?.count, 1);
  assert.equal(buckets.get("Git commands")?.count, 1);
  assert.equal(buckets.get("Deploy/release/run/build")?.count, 2);
  assert.equal(buckets.get("Code review/QA")?.count, 1);
  assert.equal(buckets.get("Research")?.count, 1);
  assert.equal(buckets.get("Documentation")?.count, 1);
  assert.equal(buckets.get("Testing/verification")?.count, 1);
  assert.equal(buckets.get("Refactor/cleanup")?.count, 1);
  assert.equal(buckets.get("Plan approvals")?.count, 1);
  assert.equal(buckets.get("Feedback/context")?.count, 1);
  assert.equal(buckets.get("Implementation")?.count, 1);
  assert.equal(buckets.get("Planning/strategy")?.count, 1);
  assert.equal(buckets.get("Content creation")?.count, 1);
  assert.equal(buckets.get("Data/metrics")?.count, 1);
  assert.equal(buckets.get("Deploy/release/run/build")?.examples[0], "Deploy to production");
  assert.equal(buckets.get("Deploy/release/run/build")?.percentage, 12.5);

  const unfilteredSummary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  const unfilteredBuckets = new Map(unfilteredSummary.promptIntents.buckets.map((bucket) => [bucket.label, bucket]));
  assert.equal(unfilteredSummary.promptIntents.totalMessages, 17);
  assert.equal(unfilteredBuckets.get("Deploy/release/run/build")?.count, 3);
});

test("summarizeParsedCorpus counts automation prompts separately from sent user messages", () => {
  const corpus = {
    files: [
      {
        filePath: "automation-session.jsonl",
        sessionId: "automation-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "automation-session.jsonl",
        sessionId: "automation-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "automation-session.jsonl",
        sessionId: "automation-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "automation",
        sourceEvent: "event_msg.automation_message",
        content: "Automation: Daily fixture sync",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "automation-session.jsonl",
        sessionId: "automation-session",
        timestamp: "2026-01-01T00:01:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "Real user prompt",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  assert.equal(summary.totals.userMessages, 1);
  assert.equal(summary.totals.automationMessages, 1);
  assert.equal(summary.totals.uniqueUserMessages, 1);
  assert.equal(summary.sessions[0]?.userMessages, 1);
  assert.equal(summary.sessions[0]?.automationMessages, 1);
  assert.equal(summary.messagesByDay[0]?.count, 1);
});

test("summarizeParsedCorpus hides automation-only sessions from the actionable session list", () => {
  const corpus = {
    files: [
      {
        filePath: "automation-only-session.jsonl",
        sessionId: "automation-only-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [
          {
            filePath: "automation-only-session.jsonl",
            sessionId: "automation-only-session",
            timestamp: "2026-01-01T00:00:00.000Z",
            role: "automation",
            sourceEvent: "event_msg.automation_message",
            content: "Automation: Daily fixture sync",
            imagesCount: 0,
            localImagesCount: 0
          }
        ],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "automation-only-session.jsonl",
        sessionId: "automation-only-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "automation-only-session.jsonl",
        sessionId: "automation-only-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "automation",
        sourceEvent: "event_msg.automation_message",
        content: "Automation: Daily fixture sync",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  const projects = projectsFromCorpus(corpus);

  assert.equal(summary.totals.sessions, 0);
  assert.equal(summary.totals.automationMessages, 1);
  assert.deepEqual(summary.sessions, []);
  assert.equal(projects[0]?.sessions, 0);
  assert.equal(projects[0]?.messages, 0);
});

test("summarizeParsedCorpus attributes token usage to models by session and turn", () => {
  const corpus = {
    files: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        cwd: "/tmp/project-a",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        cwd: "/tmp/project-b",
        timestamp: "2026-01-01T00:00:00.000Z"
      }
    ],
    turns: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:00:00.000Z",
        model: "model-a"
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:01:00.000Z",
        model: "model-b"
      }
    ],
    messages: [],
    tokenUsage: [
      {
        filePath: "session-a.jsonl",
        sessionId: "session-a",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:00:30.000Z",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          freshInputTokens: 10,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          totalTokens: 15
        }
      },
      {
        filePath: "session-b.jsonl",
        sessionId: "session-b",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:01:30.000Z",
        usage: {
          inputTokens: 20,
          cachedInputTokens: 0,
          freshInputTokens: 20,
          outputTokens: 7,
          reasoningOutputTokens: 0,
          totalTokens: 27
        }
      }
    ],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus);
  const modelA = summary.models.find((bucket) => bucket.model === "model-a");
  const modelB = summary.models.find((bucket) => bucket.model === "model-b");

  assert.equal(modelA?.tokens.totalTokens, 15);
  assert.equal(modelB?.tokens.totalTokens, 27);
});

test("summarizeParsedCorpus and searchMessages scope duplicate session ids by file path", () => {
  const corpus = {
    files: [
      {
        filePath: "alpha.jsonl",
        sessionId: "duplicate-session",
        lineCount: 3,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "beta.jsonl",
        sessionId: "duplicate-session",
        lineCount: 3,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "alpha.jsonl",
        sessionId: "duplicate-session",
        cwd: "/tmp/alpha-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "beta.jsonl",
        sessionId: "duplicate-session",
        cwd: "/tmp/beta-app",
        timestamp: "2026-01-02T00:00:00.000Z"
      }
    ],
    turns: [
      {
        filePath: "alpha.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:00:00.000Z",
        model: "alpha-model"
      },
      {
        filePath: "beta.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-02T00:00:00.000Z",
        model: "beta-model"
      }
    ],
    messages: [
      {
        filePath: "alpha.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:00:01.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "repeated duplicate prompt",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "beta.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-02T00:00:01.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "repeated duplicate prompt",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [
      {
        filePath: "alpha.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-01T00:00:02.000Z",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          freshInputTokens: 10,
          outputTokens: 1,
          reasoningOutputTokens: 0,
          totalTokens: 11
        }
      },
      {
        filePath: "beta.jsonl",
        sessionId: "duplicate-session",
        turnId: "shared-turn",
        timestamp: "2026-01-02T00:00:02.000Z",
        usage: {
          inputTokens: 20,
          cachedInputTokens: 0,
          freshInputTokens: 20,
          outputTokens: 2,
          reasoningOutputTokens: 0,
          totalTokens: 22
        }
      }
    ],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const betaSummary = summarizeParsedCorpus(corpus, { project: "beta-app" });
  const betaSearch = searchMessages(corpus, {
    query: "duplicate prompt",
    project: "beta-app",
    model: "beta-model"
  });
  const wrongModelSearch = searchMessages(corpus, {
    query: "duplicate prompt",
    project: "beta-app",
    model: "alpha-model"
  });
  const fileScopedSessionSearch = searchMessages(corpus, {
    query: "duplicate prompt",
    sessionId: "duplicate-session",
    filePath: "beta.jsonl"
  });
  const allSummary = summarizeParsedCorpus(corpus);

  assert.equal(betaSummary.totals.sessions, 1);
  assert.equal(betaSummary.totals.turns, 1);
  assert.equal(betaSummary.totals.userMessages, 1);
  assert.equal(betaSummary.tokens.totalTokens, 22);
  assert.equal(betaSummary.models[0]?.model, "beta-model");
  assert.equal(betaSummary.sessions[0]?.filePath, "beta.jsonl");
  assert.equal(betaSummary.sessions[0]?.project, "beta-app");
  assert.equal(betaSearch.totalMatches, 1);
  assert.equal(betaSearch.results[0]?.filePath, "beta.jsonl");
  assert.equal(wrongModelSearch.totalMatches, 0);
  assert.equal(fileScopedSessionSearch.totalMatches, 1);
  assert.equal(fileScopedSessionSearch.results[0]?.filePath, "beta.jsonl");
  assert.equal(allSummary.totals.sessions, 2);
  assert.deepEqual(allSummary.repeatedUserMessages[0]?.projects, ["alpha-app", "beta-app"]);
  assert.equal(allSummary.repeatedUserMessages[0]?.sessionCount, 2);
});

test("searchMessages searches messages across all projects and supports project filtering", async () => {
  const corpus = await parseCodexCorpus({ paths: [fixturePath] });

  const allResults = searchMessages(corpus, { query: "parser test" });
  assert.equal(allResults.totalMatches, 2);
  assert.equal(allResults.results[0]?.project, "sample-app");

  const userResults = searchMessages(corpus, { query: "parser test", role: "user" });
  assert.equal(userResults.totalMatches, 1);
  assert.equal(userResults.results[0]?.role, "user");
  assert.equal(userResults.results[0]?.model, "gpt-5.5");

  const modelResults = searchMessages(corpus, { query: "parser test", model: "gpt-5.5" });
  assert.equal(modelResults.totalMatches, 2);

  const wrongModelResults = searchMessages(corpus, { query: "parser test", model: "gpt-4.1" });
  assert.equal(wrongModelResults.totalMatches, 0);

  const sessionResults = searchMessages(corpus, { query: "parser test", sessionId: "sample-session-1" });
  assert.equal(sessionResults.totalMatches, 2);

  const filteredResults = searchMessages(corpus, {
    query: "parser test",
    project: "other-project"
  });
  assert.equal(filteredResults.totalMatches, 0);

  const sentMessages = searchMessages(corpus, {
    query: "",
    role: "user",
    project: "sample-app"
  });
  assert.equal(sentMessages.totalMatches, 1);
  assert.equal(sentMessages.results[0]?.role, "user");
  assert.match(sentMessages.results[0]?.snippet, /parser test/);
  assert.match(sentMessages.results[0]?.content, /parser test/);
});

test("searchMessages can browse only submitted user messages", () => {
  const corpus = {
    files: [],
    sessions: [{ filePath: "fixture.jsonl", sessionId: "session-1", cwd: "/tmp/sample-app" }],
    turns: [],
    messages: [
      {
        filePath: "fixture.jsonl",
        sessionId: "session-1",
        lineNumber: 2,
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "Typed prompt",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "fixture.jsonl",
        sessionId: "session-1",
        lineNumber: 3,
        timestamp: "2026-01-01T00:00:01.000Z",
        role: "user",
        sourceEvent: "response_item.message",
        content: "<goal_context>\nContinue working toward the active thread goal.",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "fixture.jsonl",
        sessionId: "session-1",
        lineNumber: 4,
        timestamp: "2026-01-01T00:00:02.000Z",
        role: "automation",
        sourceEvent: "event_msg.automation_message",
        content: "Automation: Daily fixture sync",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const allUserMessages = searchMessages(corpus, { query: "", role: "user" });
  assert.equal(allUserMessages.totalMatches, 2);

  const automationMessages = searchMessages(corpus, { query: "", role: "automation" });
  assert.equal(automationMessages.totalMatches, 1);
  assert.equal(automationMessages.results[0]?.sourceEvent, "event_msg.automation_message");

  const submittedMessages = searchMessages(corpus, { query: "", role: "user", submittedOnly: true });
  assert.equal(submittedMessages.totalMatches, 1);
  assert.equal(submittedMessages.results[0]?.sourceEvent, "event_msg.user_message");
  assert.equal(submittedMessages.results[0]?.lineNumber, 2);
  assert.equal(submittedMessages.results[0]?.snippet, "Typed prompt");
  assert.equal(submittedMessages.results[0]?.content, "Typed prompt");
});

test("searchMessages anchors snippets for whitespace-normalized message matches", () => {
  const corpus = {
    files: [],
    sessions: [{ filePath: "fixture.jsonl", sessionId: "session-1", cwd: "/tmp/sample-app" }],
    turns: [],
    messages: [
      {
        filePath: "fixture.jsonl",
        sessionId: "session-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: `${"prefix ".repeat(30)}needle\n\nphrase tail`,
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const result = searchMessages(corpus, { query: "needle phrase" });

  assert.equal(result.totalMatches, 1);
  assert.match(result.results[0]?.id ?? "", /session-1/);
  assert.match(result.results[0]?.snippet ?? "", /needle\n\nphrase/);
  assert.equal((result.results[0]?.snippet ?? "").indexOf("needle") < 50, true);
  assert.equal(result.results[0]?.snippet.startsWith("..."), true);
});

test("summarizeParsedCorpus filters session list and session total by date range", () => {
  const corpus = {
    files: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-03T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "old message",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        timestamp: "2026-01-03T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "new message",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app", since: "2026-01-02" });

  assert.equal(summary.totals.sessions, 1);
  assert.deepEqual(summary.sessions.map((session) => session.sessionId), ["new-session"]);
  assert.equal(summary.totals.userMessages, 1);
});

test("summarizeParsedCorpus splits long raw sessions into daily session slices", () => {
  const corpus = {
    files: [
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        lineCount: 6,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T12:00:00.000Z"
      }
    ],
    turns: [
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-1",
        timestamp: "2026-01-01T12:00:00.000Z",
        model: "model-a"
      },
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-2",
        timestamp: "2026-01-02T12:00:00.000Z",
        model: "model-a"
      }
    ],
    messages: [
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-1",
        timestamp: "2026-01-01T12:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "first day prompt",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-1",
        timestamp: "2026-01-01T12:01:00.000Z",
        role: "assistant",
        sourceEvent: "event_msg.agent_message",
        content: "first day response",
        imagesCount: 0,
        localImagesCount: 0
      },
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-2",
        timestamp: "2026-01-02T12:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "second day prompt",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-1",
        timestamp: "2026-01-01T12:02:00.000Z",
        usage: {
          inputTokens: 10,
          cachedInputTokens: 0,
          freshInputTokens: 10,
          outputTokens: 5,
          reasoningOutputTokens: 0,
          totalTokens: 15
        }
      },
      {
        filePath: "spanning.jsonl",
        sessionId: "spanning-session",
        turnId: "turn-2",
        timestamp: "2026-01-02T12:02:00.000Z",
        usage: {
          inputTokens: 20,
          cachedInputTokens: 0,
          freshInputTokens: 20,
          outputTokens: 10,
          reasoningOutputTokens: 0,
          totalTokens: 30
        }
      }
    ],
    taskTimings: [],
    toolEvents: [],
    unknownEvents: [],
    warnings: []
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app" });
  const firstDay = summary.sessions.find((session) => session.firstSeen === "2026-01-01T12:00:00.000Z");
  const secondDay = summary.sessions.find((session) => session.firstSeen === "2026-01-02T12:00:00.000Z");

  assert.equal(summary.totals.sessions, 2);
  assert.equal(new Set(summary.sessions.map((session) => session.dateKey)).size, 2);
  assert.equal(firstDay?.userMessages, 1);
  assert.equal(firstDay?.assistantMessages, 1);
  assert.equal(firstDay?.totalTokens, 15);
  assert.equal(secondDay?.userMessages, 1);
  assert.equal(secondDay?.assistantMessages, 0);
  assert.equal(secondDay?.totalTokens, 30);

  const firstDaySearch = searchMessages(corpus, {
    query: "day prompt",
    sessionId: "spanning-session",
    filePath: "spanning.jsonl",
    dateKey: firstDay?.dateKey
  });
  assert.equal(firstDaySearch.totalMatches, 1);
  assert.equal(firstDaySearch.results[0]?.snippet, "first day prompt");
  assert.equal(firstDaySearch.results[0]?.dateKey, firstDay?.dateKey);
});

test("summarizeParsedCorpus filters diagnostics by visible project sessions and date range", () => {
  const corpus = {
    files: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      },
      {
        filePath: "other.jsonl",
        sessionId: "other-session",
        lineCount: 1,
        sessions: [],
        turns: [],
        messages: [],
        tokenUsage: [],
        taskTimings: [],
        toolEvents: [],
        unknownEvents: [],
        warnings: []
      }
    ],
    sessions: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-01T00:00:00.000Z"
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        cwd: "/tmp/sample-app",
        timestamp: "2026-01-03T00:00:00.000Z"
      },
      {
        filePath: "other.jsonl",
        sessionId: "other-session",
        cwd: "/tmp/other-app",
        timestamp: "2026-01-03T00:00:00.000Z"
      }
    ],
    turns: [],
    messages: [
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        timestamp: "2026-01-03T00:00:00.000Z",
        role: "user",
        sourceEvent: "event_msg.user_message",
        content: "new message",
        imagesCount: 0,
        localImagesCount: 0
      }
    ],
    tokenUsage: [],
    taskTimings: [],
    toolEvents: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        timestamp: "2026-01-01T00:00:00.000Z",
        eventType: "exec_command_end"
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        timestamp: "2026-01-03T00:00:00.000Z",
        eventType: "exec_command_end"
      },
      {
        filePath: "other.jsonl",
        sessionId: "other-session",
        timestamp: "2026-01-03T00:00:00.000Z",
        eventType: "exec_command_end"
      }
    ],
    unknownEvents: [
      {
        filePath: "old.jsonl",
        sessionId: "old-session",
        lineNumber: 2,
        timestamp: "2026-01-01T00:00:00.000Z",
        topLevelType: "future",
        raw: {}
      },
      {
        filePath: "new.jsonl",
        sessionId: "new-session",
        lineNumber: 2,
        timestamp: "2026-01-03T00:00:00.000Z",
        topLevelType: "future",
        raw: {}
      },
      {
        filePath: "other.jsonl",
        sessionId: "other-session",
        lineNumber: 2,
        timestamp: "2026-01-03T00:00:00.000Z",
        topLevelType: "future",
        raw: {}
      }
    ],
    warnings: [
      {
        filePath: "old.jsonl",
        lineNumber: 99,
        code: "malformed_json",
        message: "old warning"
      },
      {
        filePath: "new.jsonl",
        lineNumber: 99,
        code: "malformed_json",
        message: "new warning"
      },
      {
        filePath: "other.jsonl",
        lineNumber: 99,
        code: "malformed_json",
        message: "other warning"
      }
    ]
  };

  const summary = summarizeParsedCorpus(corpus, { project: "sample-app", since: "2026-01-02" });

  assert.equal(summary.totals.sessions, 1);
  assert.equal(summary.totals.toolEvents, 1);
  assert.equal(summary.totals.unknownEvents, 1);
  assert.equal(summary.totals.parseWarnings, 1);
});

test("redactedProjectSummary removes local source paths from JSON exports", async () => {
  const corpus = await parseCodexCorpus({ paths: [fixturePath] });
  const summary = summarizeParsedCorpus(corpus, { project: "sample-app", paths: [fixturePath] });

  const redacted = redactedProjectSummary(summary);
  const body = summaryToJson(summary, { redacted: true });

  assert.equal(redacted.filters.paths[0], "[redacted]");
  assert.equal(redacted.sessions[0]?.filePath, "[redacted]");
  assert.equal(redacted.sessions[0]?.cwd, "[redacted]");
  assert.equal(body.includes("fixtures/codex/sample-session.jsonl"), false);
  assert.equal(body.includes("/Users/example/projects/sample-app"), false);
});
