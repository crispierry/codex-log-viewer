import { expect, test } from "@playwright/test";

const fixturePath = "fixtures/codex/sample-session.jsonl";

test("dashboard filters projects, labels project tokens, and updates session details", async ({ page }) => {
  const failedRequests: string[] = [];
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Codex Log Viewer" })).toBeVisible();

  await page.getByLabel("Log paths").fill(fixturePath);
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page.getByRole("button", { name: /sample-app/ })).toBeVisible();
  await expect(page.getByLabel(/17,277 tokens/)).toBeVisible();

  await page.getByRole("button", { name: /sample-app/ }).click();
  await expect(page.getByText("Scanning selected logs")).toBeVisible();
  await expect(page.getByText("Scanning selected logs")).toBeHidden();

  await expect(page.getByText("17,277").first()).toBeVisible();
  await expect(page.getByText("sample-session-1")).toBeVisible();

  await page.getByText("sample-session-1").click();
  await expect(page.getByRole("heading", { name: "Messages", exact: true })).toBeVisible();
  await expect(page.getByText("Create a parser test for the sample fixture")).toBeVisible();
  await expect(page.getByText("I added the parser test fixture.")).toBeVisible();

  expect(failedRequests).toEqual([]);
});
