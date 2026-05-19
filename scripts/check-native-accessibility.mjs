import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nativeSourcePaths = [
  resolve("apps/macos/Sources/CodexLogViewerMac/RootView.swift"),
  resolve("apps/macos/Sources/CodexLogViewerMac/CodexLogViewerApp.swift")
];
const nativeSource = nativeSourcePaths.map((path) => readFileSync(path, "utf8")).join("\n");

const requiredIdentifiers = [
  "refresh-button",
  "about-menu-item",
  "new-tab-menu-item",
  "help-menu-item",
  "usage-guide-menu-item",
  "status-menu-item",
  "export-json-menu-item",
  "export-csv-menu-item",
  "activity-range-label",
  "cache-status-label",
  "source-picker-menu-item",
  "source-default-menu-item",
  "recent-sources-menu",
  "project-sidebar",
  "project-sort-menu",
  "date-range-button",
  "date-range-mode-picker",
  "date-anchor-picker",
  "date-range-start-picker",
  "date-range-end-picker",
  "date-range-clear-button",
  "view-show-sessions-menu-item",
  "view-operational-all-filter",
  "view-operational-message-filter",
  "browse-messages-list",
  "message-search-field",
  "message-search-button",
  "message-role-filter",
  "message-model-filter",
  "message-search-results-table",
  "sessions-table",
  "copy-search-session-button",
  "copy-search-project-button",
  "copy-search-snippet-button",
  "retry-button"
];

const missing = requiredIdentifiers.filter(
  (identifier) => !nativeSource.includes(`.accessibilityIdentifier("${identifier}")`)
);

if (missing.length > 0) {
  console.error("Missing required native accessibility identifiers:");
  for (const identifier of missing) {
    console.error(`- ${identifier}`);
  }
  process.exit(1);
}

console.log(`Native accessibility identifier check passed for ${requiredIdentifiers.length} controls.`);
