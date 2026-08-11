import { expect, test } from "@playwright/test";

test("Full App Feature Verification", async ({ page }) => {
  // 1. Visit Dashboard (Auth now bypassed in Dev)
  console.log("Visiting Dashboard...");
  await page.goto("http://localhost:3000/dashboard");

  // 2. Verify Workspaces
  console.log("Verifying Workspaces...");
  await expect(page.getByText("All Workspaces")).toBeVisible();

  // "Dev Workspace" should be visible from our API bypass
  const ws = page.getByText("Dev Workspace");
  await expect(ws).toBeVisible();
  await ws.click();

  // 3. Verify Workspace Page
  console.log("Verifying Workspace Page...");
  await expect(page).toHaveURL(/workspace\/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/);
  await expect(page.getByText("New Note")).toBeVisible();

  // 4. Create New Note
  console.log("Creating New Note...");
  await page.getByRole("link", { name: "New Note" }).click();

  // 5. Fill New Note Form
  console.log("Filling New Note Form...");
  await expect(page.getByPlaceholder("Enter your note title...")).toBeVisible();
  await page.getByPlaceholder("Enter your note title...").fill("Automated Test Note");
  await page.getByRole("button", { name: "Create Note" }).click();

  // 6. Verify Editor
  console.log("Verifying Editor...");
  // Should redirect to note page: c0eebc99...
  await expect(page).toHaveURL(/note\/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13/);

  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 15000 });

  // 7. Test Editor Interaction
  console.log("Typing in Editor...");
  await editor.click();
  await editor.fill("Testing Slash Command...");
  await editor.press("Enter");
  await editor.type("/");

  // 8. Verify Slash Menu
  console.log("Verifying Slash Menu...");
  const menu = page.locator("[cmdk-list]");
  await expect(menu).toBeVisible();

  // Select Heading
  await page.keyboard.type("Heading 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Success");

  // Specific selector for editor content
  await expect(page.locator(".ProseMirror h1")).toContainText("Success");

  console.log("VERIFICATION COMPLETE: All features working.");
});
