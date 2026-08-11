import { expect, test } from "@playwright/test";

test("App Smoke Test: Editor & Slash Command", async ({ page }) => {
  // 1. Visit Home
  console.log("Visiting home page...");
  await page.goto("http://127.0.0.1:3000");
  await expect(page).toHaveTitle(/Luman/i);

  // 2. Check basics
  console.log("Checking for editor presence...");
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 10000 });

  // 3. Type in editor
  console.log("Typing in editor...");
  await editor.click();
  await editor.fill("Hello world, this is an automated test.");
  await expect(page.getByText("Hello world, this is an automated test.")).toBeVisible();

  // 4. Use Slash Command
  console.log("Testing Slash Command...");
  await editor.press("Enter");
  await editor.type("/");

  // Wait for the prompt menu to appear
  const commandList = page.locator("[cmdk-list]");
  // or depending on implementation: page.locator('.slash-command-menu')
  // Let's try to find a known item like "Text" or "Heading"

  // Note: Implementation might vary, looking for generic indicators
  await expect(page.getByText("Heading 1")).toBeVisible({ timeout: 5000 });

  // Select Heading 1
  console.log("Selecting Heading 1...");
  await page.keyboard.press("Enter");

  // Type heading
  await page.keyboard.type("My New Heading");

  // Verify heading
  await expect(page.locator("h1")).toContainText("My New Heading");

  console.log("Test Complete: Editor works, Slash command works.");
});
