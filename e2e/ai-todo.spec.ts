import { expect, test } from "@playwright/test";

test("Feature Check: AI Scheduler & Todo Sync", async ({ page }) => {
  // 1. Setup Mocks for AI Chat
  await page.route("**/api/chat", async (route) => {
    // Simulate AI response stream
    // The Format for 'ai' SDK data stream is complex.
    // We'll use a text response if simple fetch is used, but likely it expects a stream.
    // If we can't easily mock the stream format, we verify the REQUEST is sent.
    console.log("AI Chat Request received");

    // We will verify the request content
    const body = await route.request().postDataJSON();
    if (body.messages) {
      console.log("Message sent to AI:", body.messages[body.messages.length - 1].content);
    }

    // Mock a simple stream response (Text Part)
    // 0: "text",
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: '0:"I have scheduled the note for tomorrow."\n',
    });
  });

  // 2. Setup Monitor for Task Sync
  let taskSyncTriggered = false;
  page.on("request", (req) => {
    if (req.url().includes("/api/tasks") && req.method() === "POST") {
      console.log("Task Sync Triggered!");
      taskSyncTriggered = true;
    }
  });

  // 3. Navigate to Note (Dev Mode Bypassed)
  // Use the UUID we hardcoded: c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13
  await page.goto(
    "http://localhost:3000/workspace/a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/note/c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
  );

  // Wait for editor
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 15000 });

  // 4. Verify Todo Feature
  console.log("Testing Todo...");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("[] My New Task");
  await page.keyboard.press("Enter");

  // Wait for debounce (2000ms in advanced-editor.tsx)
  await page.waitForTimeout(2500);

  if (taskSyncTriggered) {
    console.log("✅ Todo Sync API called successfully.");
  } else {
    throw new Error("❌ Todo Sync API was NOT called.");
  }

  // 5. Verify AI Scheduler
  console.log("Testing AI Scheduler...");
  // Click AI Chat button
  const aiButton = page.getByRole("button", { name: "AI Chat" });
  await expect(aiButton).toBeVisible();
  await aiButton.click();

  // Check sidebar opens
  const chatInput = page.getByPlaceholder("Ask me anything...");
  await expect(chatInput).toBeVisible();

  // Send Message
  await chatInput.fill("Schedule this for tomorrow");
  await page.keyboard.press("Enter");

  // Verify Response (from our mock)
  // The 'ai' SDK stream decoder might behave differently if format is wrong,
  // but let's check if the text appears.
  await expect(page.getByText("I have scheduled the note")).toBeVisible({ timeout: 10000 });

  console.log("✅ AI Chat Scheduler Request sent and Response received.");
});
