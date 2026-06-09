import { test, expect } from "@playwright/test";
import {
  mockTtsApi,
  mockPteStimulusApi,
  mockPteFeedbackApi,
  mockAudioAutoEnd,
} from "./helpers";

const PLAIN_STIMULUS =
  "Academic research has shown that regular exercise improves cognitive function and memory retention in adults of all ages.";

const FIB_L_STIMULUS = JSON.stringify({
  passage: "The scientists [BLANK_0] new data every day, which helps them [BLANK_1] their theories.",
  blanks: [
    { options: ["collect", "ignore", "forget"], correct: 0 },
    { options: ["refine", "abandon", "discard"], correct: 0 },
  ],
});

const HCS_STIMULUS = JSON.stringify({
  passage:
    "Renewable energy sources like solar and wind power are becoming increasingly important for reducing carbon emissions worldwide.",
  summaries: [
    "Renewable energy is growing in importance for cutting carbon emissions.",
    "Fossil fuels remain the most reliable global energy source.",
    "Carbon emissions have little impact on the global climate.",
    "Solar panels are prohibitively expensive for most households.",
    "Wind power technology is not yet viable at industrial scale.",
  ],
  correct: 0,
});

test.describe("PTE Listening — Summarize Spoken Text", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/summarize-spoken-text");
    await expect(
      page.getByRole("heading", { name: /summarize spoken text/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte listening/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /generate passage/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → play → write → submit shows feedback", async ({ page }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, PLAIN_STIMULUS);
    await mockTtsApi(page);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/summarize-spoken-text");
    await page.getByRole("button", { name: /generate passage/i }).click();

    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(page.locator("textarea")).toBeVisible({ timeout: 5000 });

    await page.locator("textarea").fill(
      "Regular exercise has been shown to improve memory and cognitive function in adults of all ages."
    );
    const submitBtn = page.getByRole("button", { name: /submit summary/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.getByText(/good attempt at the task/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("word counter reflects typed content", async ({ page }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, PLAIN_STIMULUS);
    await mockTtsApi(page);

    await page.goto("/practice/summarize-spoken-text");
    await page.getByRole("button", { name: /generate passage/i }).click();
    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(page.locator("textarea")).toBeVisible({ timeout: 5000 });

    await page.locator("textarea").fill("one two three");
    await expect(page.getByText(/3 words/i)).toBeVisible();
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/summarize-spoken-text");
    await page.getByRole("button", { name: /generate passage/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("PTE Listening — Fill in the Blanks (Listening)", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/fill-in-the-blanks-listening");
    await expect(
      page.getByRole("heading", { name: /fill in the blanks/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte listening/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /get passage/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → play → select dropdowns → submit shows feedback", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, FIB_L_STIMULUS);
    await mockTtsApi(page);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/fill-in-the-blanks-listening");
    await page.getByRole("button", { name: /get passage/i }).click();

    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(page.locator("select").first()).toBeVisible({ timeout: 5000 });

    // Select an answer for each blank (scoped to main to avoid nav language selector)
    const selects = page.locator("main select");
    await selects.nth(0).selectOption("collect");
    await selects.nth(1).selectOption("refine");

    const submitBtn = page.getByRole("button", { name: /submit answers/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.getByText(/good attempt at the task/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("submit button disabled until all blanks answered", async ({ page }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, FIB_L_STIMULUS);
    await mockTtsApi(page);

    await page.goto("/practice/fill-in-the-blanks-listening");
    await page.getByRole("button", { name: /get passage/i }).click();
    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(page.locator("select").first()).toBeVisible({ timeout: 5000 });

    // Only answer one of two blanks (scoped to main to avoid nav language selector)
    await page.locator("main select").first().selectOption("collect");
    await expect(
      page.getByRole("button", { name: /submit answers/i })
    ).toBeDisabled();
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/fill-in-the-blanks-listening");
    await page.getByRole("button", { name: /get passage/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("PTE Listening — Highlight Correct Summary", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/highlight-correct-summary");
    await expect(
      page.getByRole("heading", { name: /highlight correct summary/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte listening/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /get question/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → play → select radio → submit shows feedback", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, HCS_STIMULUS);
    await mockTtsApi(page);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/highlight-correct-summary");
    await page.getByRole("button", { name: /get question/i }).click();

    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(
      page.locator('input[type="radio"]').first()
    ).toBeVisible({ timeout: 5000 });

    // Verify 5 options are rendered
    await expect(page.locator('input[type="radio"]')).toHaveCount(5);

    // Select option A
    await page.locator('input[type="radio"]').first().click();

    const submitBtn = page.getByRole("button", { name: /submit answer/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.getByText(/good attempt at the task/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("submit button disabled until an option is selected", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockAudioAutoEnd(page);
    await mockPteStimulusApi(page, HCS_STIMULUS);
    await mockTtsApi(page);

    await page.goto("/practice/highlight-correct-summary");
    await page.getByRole("button", { name: /get question/i }).click();
    await expect(
      page.getByRole("button", { name: /play passage/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /play passage/i }).click();
    await expect(
      page.locator('input[type="radio"]').first()
    ).toBeVisible({ timeout: 5000 });

    // No selection yet — submit should be disabled
    await expect(
      page.getByRole("button", { name: /submit answer/i })
    ).toBeDisabled();
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/highlight-correct-summary");
    await page.getByRole("button", { name: /get question/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
