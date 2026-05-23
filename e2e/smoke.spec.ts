import { test, expect } from "@playwright/test";
import { mockAllApis, mockExaminerApi, mockFeedbackApi, mockTtsApi, mockPronunciationApi } from "./helpers";

test.describe("P0 — Core path smoke tests", () => {
  test("home page loads with DesktopNav and main CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator('a[href="/practice/setup"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practice/exam"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practice/shadowing"]').first()).toBeVisible();
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
    await expect(page.getByRole("button", { name: /speaking drill/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /mock exam/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /shadowing/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /part 1/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 2/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 3/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /full test/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /start practice/i })).toBeVisible();
  });

  test("practice → end → feedback → history", async ({ page }) => {
    test.setTimeout(60_000);
    await mockAllApis(page);
    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });
    const input = page.locator('input[type="text"]');
    await input.fill("I come from Shanghai, which is a large coastal city.");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText("That's interesting. Can you tell me more about your hometown?")).toBeVisible({ timeout: 10000 });
    await page.getByText(/end session/i).click();
    await expect(page.getByText(/estimated band/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("6.5")).toBeVisible();
    await expect(page.getByText(/next study plan/i)).toBeVisible();
    await expect(page.getByText(/what worked/i)).toBeVisible();
    await expect(page.getByText(/focus areas/i)).toBeVisible();
    await page.locator('a[href="/history"]').last().click();
    await page.waitForURL("**/history**");
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("home → mock exam entry", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href="/practice/exam"]').first().click();
    await page.waitForURL("**/practice/exam**");
    await expect(page.locator("nav").first()).toBeVisible({ timeout: 10000 });
  });

  test("history page empty state", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByText(/no practice sessions yet/i)).toBeVisible({ timeout: 10000 });
  });

  test("stats page empty state", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByText(/no practice data yet/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("P1 — Key interactions", () => {
  test("setup page passes focus params via URL", async ({ page }) => {
    await page.goto("/practice/setup?focus=fluency,grammar");
    await expect(page.getByText(/training goal/i)).toBeVisible({ timeout: 10000 });
  });

  test("practice page text/voice mode toggle", async ({ page }) => {
    await mockExaminerApi(page);
    await mockTtsApi(page);
    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await page.getByText(/voice mode/i).click();
    await page.getByText(/text mode/i).click();
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test("shadowing setup page renders modes and topics", async ({ page }) => {
    await page.goto("/practice/shadowing");
    await expect(page.getByText(/shadowing/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /part 1/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 2/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /part 3/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible();
    const topicChips = page.locator("button").filter({ hasText: /\w{3,}/ });
    await expect(topicChips.first()).toBeVisible();
  });

  test("shadowing setup shows priority words from URL param", async ({ page }) => {
    await page.goto("/practice/shadowing?words=pronunciation,fluency");
    await expect(page.getByText(/priority/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("pronunciation", { exact: true })).toBeVisible();
    await expect(page.getByText("fluency", { exact: true })).toBeVisible();
  });

  test("exam page loads with Part 1 greeting and stage indicator", async ({ page }) => {
    await mockExaminerApi(page);
    await mockFeedbackApi(page);
    await mockTtsApi(page);
    await page.goto("/practice/exam");
    await expect(page.getByText(/good morning|good afternoon/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Part 1", { exact: false }).first()).toBeVisible();
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.getByText(/end exam/i)).toBeVisible();
  });

  test("setup page topic selection changes start link URL", async ({ page }) => {
    await page.goto("/practice/setup");
    await expect(page.getByRole("link", { name: /start practice/i })).toBeVisible({ timeout: 10000 });
    const startLink = page.getByRole("link", { name: /start practice/i });
    await expect(startLink).toHaveAttribute("href", /practice\?mode=part1/);
    const topicChip = page.locator("section").filter({ hasText: /choose a topic/i }).locator("button").first();
    await topicChip.click();
    await expect(startLink).toHaveAttribute("href", /topic=/);
  });

  test("shadowing setup → start → practice view → record → next", async ({ page, context }) => {
    test.setTimeout(30_000);
    await context.grantPermissions(["microphone"]);
    await mockTtsApi(page);
    await mockPronunciationApi(page);
    await page.goto("/practice/shadowing");
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /start/i }).first().click();
    await expect(page.getByText(/listen and repeat/i)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /start recording/i }).click();
    await expect(page.getByRole("button", { name: /stop recording/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /stop recording/i }).click();
    const nextBtn = page.getByRole("button", { name: /next sentence/i });
    const tryAgainBtn = page.getByRole("button", { name: /try again/i });
    const errorMsg = page.getByText(/no audio|failed|error/i);
    await expect(nextBtn.or(tryAgainBtn).or(errorMsg).first()).toBeVisible({ timeout: 15000 });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await expect(page.getByText(/listen and repeat/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test("exam page Part 2 timer appears after cue card message", async ({ page }) => {
    test.setTimeout(30_000);
    await mockFeedbackApi(page);
    await mockTtsApi(page);
    let examinerCallCount = 0;
    await page.route("**/api/examiner", (route) => {
      examinerCallCount++;
      if (examinerCallCount === 1) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "That's interesting. Can you tell me more about yourself?" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "I'm going to give you a topic and I'd like you to talk about it for 1-2 minutes. Describe a place you have visited that you found interesting." }) });
    });
    await page.goto("/practice/exam");
    await expect(page.getByText(/good morning|good afternoon/i).first()).toBeVisible({ timeout: 10000 });
    const input = page.locator('input[type="text"]');
    await input.fill("My name is Test. I'm from Beijing.");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/interesting/i)).toBeVisible({ timeout: 10000 });
    await input.fill("I'd like to talk about the Great Wall.");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/give you a topic/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/prep/i).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("P1.5 — Extended user journeys", () => {
  test("full user path: home → setup → practice → end → feedback → history", async ({ page }) => {
    test.setTimeout(90_000);
    await mockAllApis(page);

    // 1. Start from home page
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();

    // 2. Click the main "Start Practice" CTA to go to setup
    const setupLink = page.locator('a[href="/practice/setup"]').first();
    await setupLink.click();
    await page.waitForURL("**/practice/setup**");

    // 3. Setup page loads -- verify training types and modes
    await expect(page.getByRole("button", { name: /speaking drill/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /part 1/i }).first()).toBeVisible();

    // 4. Select a topic chip (first available topic)
    const topicChip = page.locator("section").filter({ hasText: /choose a topic/i }).locator("button").first();
    await topicChip.click();

    // 5. Start link should now include topic param
    const startLink = page.getByRole("link", { name: /start practice/i });
    await expect(startLink).toHaveAttribute("href", /topic=/);

    // 6. Navigate to practice page via the start link
    await startLink.click();
    await page.waitForURL("**/practice?**");

    // 7. Practice page loads -- verify initial examiner message
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="text"]')).toBeVisible();

    // 8. Type and send a message
    const input = page.locator('input[type="text"]');
    await input.fill("I enjoy reading books and exploring new places in my free time.");
    await page.getByRole("button", { name: /^send$/i }).click();

    // 9. Wait for mock examiner response
    await expect(page.getByText("That's interesting. Can you tell me more about your hometown?")).toBeVisible({ timeout: 10000 });

    // 10. End session
    await page.getByText(/end session/i).click();

    // 11. Wait for feedback panel
    await expect(page.getByText(/estimated band/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("6.5")).toBeVisible();

    // 12. Verify feedback panel content
    await expect(page.getByText(/next study plan/i)).toBeVisible();
    await expect(page.getByText(/what worked/i)).toBeVisible();
    await expect(page.getByText(/focus areas/i)).toBeVisible();

    // 13. Navigate to history via the feedback panel footer link
    await page.locator('a[href="/history"]').last().click();
    await page.waitForURL("**/history**");

    // 14. History page loads and shows the session
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText(/no practice sessions yet/i)).not.toBeVisible({ timeout: 10000 });
  });

  test("practice page text/voice mode toggle with VoiceControls", async ({ page }) => {
    await mockExaminerApi(page);
    await mockTtsApi(page);
    await page.goto("/practice?mode=part1");

    // Wait for page to load
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });

    // Text mode is default -- text input visible
    await expect(page.locator('input[type="text"]')).toBeVisible();

    // Switch to voice mode
    await page.getByText(/voice mode/i).click();

    // VoiceControls should be visible — the main voice button or fallback "not supported" text
    // VoiceControls renders aria-label="Start speaking" or shows "Voice not supported"
    const voiceButton = page.getByRole("button", { name: /start speaking/i });
    const voiceNotSupported = page.getByText(/voice not supported/i);
    await expect(voiceButton.or(voiceNotSupported).first()).toBeVisible({ timeout: 5000 });

    // Text input should NOT be visible in voice mode
    await expect(page.locator('input[type="text"]')).not.toBeVisible();

    // Switch back to text mode
    await page.getByText(/text mode/i).click();

    // Text input should be visible again
    await expect(page.locator('input[type="text"]')).toBeVisible();
  });

  test("setup page URL focus params display focus area tags", async ({ page }) => {
    await page.goto("/practice/setup?focus=fluency,grammar");

    // Training goal banner should be visible
    await expect(page.getByText(/training goal/i)).toBeVisible({ timeout: 10000 });

    // Focus area tags should be displayed
    await expect(page.getByText("fluency", { exact: true })).toBeVisible();
    await expect(page.getByText("grammar", { exact: true })).toBeVisible();

    // Other setup elements should still work
    await expect(page.getByRole("button", { name: /speaking drill/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /start practice/i })).toBeVisible();
  });
});

test.describe("P2 — Edge cases", () => {
  test("practice page handles examiner API error", async ({ page }) => {
    await page.route("**/api/examiner", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) }));
    await mockTtsApi(page);
    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });
    const input = page.locator('input[type="text"]');
    await input.fill("Test answer");
    await page.getByRole("button", { name: /^send$/i }).click();
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
    await page.route("**/api/feedback", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) }));
    await page.goto("/practice?mode=part1");
    await expect(page.getByText(/examiner/i).first()).toBeVisible({ timeout: 10000 });
    const input = page.locator('input[type="text"]');
    await input.fill("Test answer");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/interesting/i)).toBeVisible({ timeout: 10000 });
    await page.getByText(/end session/i).click();
    await expect(page.getByText(/failed|error/i).first()).toBeVisible({ timeout: 30000 });
  });
});
