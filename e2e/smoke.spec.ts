import { test, expect } from "@playwright/test";
import { mockAllApis, mockExaminerApi, mockFeedbackApi, mockTtsApi, mockPronunciationApi } from "./helpers";

test.describe("P0 — Core path smoke tests", () => {
  test("home page loads with DesktopNav and main CTAs", async ({ page }) => {
    await page.goto("/");

    // DesktopNav visible (desktop nav is hidden on mobile, but Playwright uses desktop viewport)
    await expect(page.locator("nav").first()).toBeVisible();

    // Main CTA links are present
    await expect(page.locator('a[href="/practice/setup"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practice/exam"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practice/shadowing"]').first()).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("practice setup page renders modes and topics", async ({ page }) => {
    await page.goto("/practice/setup");

    // Training type cards visible — use role selectors to avoid ambiguity
    await expect(page.getByRole("button", { name: /speaking drill/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /mock exam/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /shadowing/i })).toBeVisible();

    // Mode cards visible
    await expect(page.getByRole("button", { name: /part 1/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 2/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 3/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /full test/i }).first()).toBeVisible();

    // Start button visible
    await expect(page.getByRole("link", { name: /start practice/i })).toBeVisible();
  });

  test("practice → end → feedback → history", async ({ page }) => {
    test.setTimeout(60_000);
    await mockAllApis(page);

    // 1. Navigate directly to practice page (Part 1 mode)
    await page.goto("/practice?mode=part1");

    // 2. Verify initial examiner message loads
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });

    // 3. Type and send a message
    const input = page.locator('input[type="text"]');
    await input.fill("I come from Shanghai, which is a large coastal city.");
    await page.getByRole("button", { name: /^send$/i }).click();

    // 4. Wait for mock examiner response
    await expect(
      page.getByText("That's interesting. Can you tell me more about your hometown?")
    ).toBeVisible({ timeout: 10000 });

    // 5. End session
    await page.getByText(/end session/i).click();

    // 6. Wait for feedback panel
    await expect(page.getByText(/estimated band/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("6.5")).toBeVisible();

    // 7. Feedback panel shows study plan and action buttons
    await expect(page.getByText(/next study plan/i)).toBeVisible();
    await expect(page.getByText(/what worked/i)).toBeVisible();
    await expect(page.getByText(/focus areas/i)).toBeVisible();

    // 8. Navigate to history via the feedback panel footer link
    await page.locator('a[href="/history"]').last().click();
    await page.waitForURL("**/history**");

    // 9. History page loads
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("home → mock exam entry", async ({ page }) => {
    await page.goto("/");

    // Click mock exam CTA
    await page.locator('a[href="/practice/exam"]').first().click();
    await page.waitForURL("**/practice/exam**");

    // Verify exam page loads
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 10000 });
  });

  test("history page empty state", async ({ page }) => {
    await page.goto("/history");

    // Should show empty state title
    await expect(page.getByText(/no practice sessions yet/i)).toBeVisible({ timeout: 10000 });
  });

  test("stats page empty state", async ({ page }) => {
    await page.goto("/stats");

    // Should show empty state title
    await expect(page.getByText(/no practice data yet/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("P1 — Key interactions", () => {
  test("setup page passes focus params via URL", async ({ page }) => {
    await page.goto("/practice/setup?focus=fluency,grammar");

    // Training goal banner should show the focus areas
    await expect(page.getByText(/training goal/i)).toBeVisible({ timeout: 10000 });
  });

  test("practice page text/voice mode toggle", async ({ page }) => {
    await mockExaminerApi(page);
    await mockTtsApi(page);
    await page.goto("/practice?mode=part1");

    // Wait for page to load
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });

    // Text mode is default - input visible
    await expect(page.locator('input[type="text"]')).toBeVisible();

    // Switch to voice mode
    await page.getByText(/voice mode/i).click();

    // Switch back to text mode
    await page.getByText(/text mode/i).click();
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test("shadowing setup page renders modes and topics", async ({ page }) => {
    await page.goto("/practice/shadowing");

    // Title visible
    await expect(page.getByText(/shadowing/i).first()).toBeVisible({ timeout: 10000 });

    // Mode selection buttons visible (Part 1, Part 2, Part 3)
    await expect(page.getByRole("button", { name: /part 1/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 2/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 3/i }).first()).toBeVisible();

    // Start button visible
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible();

    // Topic chips rendered (at least one visible)
    const topicChips = page.locator("button").filter({ hasText: /\w{3,}/ });
    await expect(topicChips.first()).toBeVisible();
  });

  test("shadowing setup shows priority words from URL param", async ({ page }) => {
    await page.goto("/practice/shadowing?words=pronunciation,fluency");

    // Priority words banner visible
    await expect(page.getByText(/priority/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("pronunciation", { exact: true })).toBeVisible();
    await expect(page.getByText("fluency", { exact: true })).toBeVisible();
  });

  test("exam page loads with Part 1 greeting and stage indicator", async ({ page }) => {
    await mockExaminerApi(page);
    await mockFeedbackApi(page);
    await mockTtsApi(page);

    await page.goto("/practice/exam");

    // Part 1 examiner greeting visible — use .first() to handle multiple matches
    await expect(page.getByText(/good morning|good afternoon/i).first()).toBeVisible({
      timeout: 10000,
    });

    // Stage indicator shows Part 1
    await expect(page.getByText("Part 1", { exact: false }).first()).toBeVisible();

    // Input area visible
    await expect(page.locator('input[type="text"]')).toBeVisible();

    // End Exam button visible
    await expect(page.getByText(/end exam/i)).toBeVisible();
  });

  test("setup page topic selection changes start link URL", async ({ page }) => {
    await page.goto("/practice/setup");

    // Wait for page to load
    await expect(page.getByRole("link", { name: /start practice/i })).toBeVisible({
      timeout: 10000,
    });

    // Default start URL has no topic
    const startLink = page.getByRole("link", { name: /start practice/i });
    await expect(startLink).toHaveAttribute("href", /practice\?mode=part1/);

    // Select a topic by name — topic chips are inside the topic selection section
    // Use a known topic name from the topics library
    const topicChip = page.locator("section").filter({ hasText: /choose a topic/i }).locator("button").first();
    await topicChip.click();

    // Start URL should now include topic param
    await expect(startLink).toHaveAttribute("href", /topic=/);
  });

  test("shadowing setup → start → practice view → record → next", async ({ page, context }) => {
    test.setTimeout(30_000);
    await context.grantPermissions(["microphone"]);
    await mockTtsApi(page);
    await mockPronunciationApi(page);

    // 1. Go to shadowing page
    await page.goto("/practice/shadowing");

    // 2. Setup view renders
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible({
      timeout: 10000,
    });

    // 3. Click Start button
    await page.getByRole("button", { name: /start/i }).first().click();

    // 4. Practice view appears — sentence card with "Listen and repeat"
    await expect(page.getByText(/listen and repeat/i)).toBeVisible({ timeout: 10000 });

    // 5. Click record button
    await page.getByRole("button", { name: /start recording/i }).click();

    // 6. Wait for recording state — stop button appears (replaces record button)
    await expect(page.getByRole("button", { name: /stop recording/i })).toBeVisible({
      timeout: 10000,
    });

    // 7. Click stop recording
    await page.getByRole("button", { name: /stop recording/i }).click();

    // 8. Wait for either pronunciation feedback OR error (fake mic may produce empty audio)
    // The page should not crash — either result or error should appear
    const nextBtn = page.getByRole("button", { name: /next sentence/i });
    const tryAgainBtn = page.getByRole("button", { name: /try again/i });
    const errorMsg = page.getByText(/no audio|failed|error/i);

    // Wait for any of these outcomes
    await expect(nextBtn.or(tryAgainBtn).or(errorMsg).first()).toBeVisible({
      timeout: 15000,
    });

    // If next sentence button appeared, verify the flow continues
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await expect(page.getByText(/listen and repeat/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("exam page Part 2 timer appears after cue card message", async ({ page }) => {
    test.setTimeout(30_000);
    await mockFeedbackApi(page);
    await mockTtsApi(page);

    // Mock examiner API with counter — first call returns Part 1, second returns Part 2 cue card
    let examinerCallCount = 0;
    await page.route("**/api/examiner", (route) => {
      examinerCallCount++;
      if (examinerCallCount === 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            message: "That's interesting. Can you tell me more about yourself?",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message:
            "I'm going to give you a topic and I'd like you to talk about it for 1-2 minutes. Describe a place you have visited that you found interesting.",
        }),
      });
    });

    // 1. Navigate to exam page
    await page.goto("/practice/exam");

    // 2. Part 1 greeting visible
    await expect(page.getByText(/good morning|good afternoon/i).first()).toBeVisible({
      timeout: 10000,
    });

    // 3. Send a message to get Part 1 response
    const input = page.locator('input[type="text"]');
    await input.fill("My name is Test. I'm from Beijing.");
    await page.getByRole("button", { name: /^send$/i }).click();

    // 4. Wait for Part 1 examiner response
    await expect(page.getByText(/interesting/i)).toBeVisible({ timeout: 10000 });

    // 5. Send another message to trigger Part 2 cue card
    await input.fill("I'd like to talk about the Great Wall.");
    await page.getByRole("button", { name: /^send$/i }).click();

    // 6. Part 2 cue card message arrives — timer should appear
    await expect(page.getByText(/give you a topic/i)).toBeVisible({ timeout: 10000 });

    // 7. Prep timer visible (countdown from 60)
    await expect(page.getByText(/prep/i).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("P2 — Edge cases", () => {
  test("practice page handles examiner API error", async ({ page }) => {
    await page.route("**/api/examiner", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      })
    );
    await mockTtsApi(page);

    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });

    const input = page.locator('input[type="text"]');
    await input.fill("Test answer");
    await page.getByRole("button", { name: /^send$/i }).click();

    // Should show error banner
    await expect(page.getByText(/failed|error/i)).toBeVisible({ timeout: 10000 });
  });

  test("dark mode does not crash pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();

    await page.goto("/practice/setup");
    await expect(page.getByText(/choose the kind of practice/i)).toBeVisible({ timeout: 10000 });

    await page.goto("/stats");
    await expect(page.locator("nav").first()).toBeVisible();

    await page.goto("/history");
    await expect(page.locator("nav").first()).toBeVisible();

    await page.goto("/practice/shadowing");
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("practice page handles feedback API error", async ({ page }) => {
    await mockExaminerApi(page);
    await mockTtsApi(page);

    // Mock feedback API to return 500
    await page.route("**/api/feedback", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      })
    );

    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });

    // Send a message to get a response
    const input = page.locator('input[type="text"]');
    await input.fill("Test answer");
    await page.getByRole("button", { name: /^send$/i }).click();

    // Wait for examiner response
    await expect(page.getByText(/interesting/i)).toBeVisible({ timeout: 10000 });

    // End session — feedback will fail
    await page.getByText(/end session/i).click();

    // Should show error (not crash)
    await expect(page.getByText(/failed|error/i).first()).toBeVisible({ timeout: 30000 });
  });
});
