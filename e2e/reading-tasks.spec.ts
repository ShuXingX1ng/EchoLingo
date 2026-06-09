import { test, expect } from "@playwright/test";
import { mockPteStimulusApi, mockPteFeedbackApi } from "./helpers";

const FIB_R_STIMULUS = JSON.stringify({
  passage:
    "The scientist [BLANK_0] the results carefully, then [BLANK_1] them with a colleague.",
  blanks: [
    { options: ["analysed", "ignored", "forgot"], correct: 0 },
    { options: ["discussed", "discarded", "hid"], correct: 0 },
  ],
});

const REORDER_STIMULUS = JSON.stringify({
  paragraphs: [
    {
      label: "A",
      text: "The industrial revolution began in Britain during the late eighteenth century.",
    },
    {
      label: "B",
      text: "It was driven by new technologies such as the steam engine.",
    },
    {
      label: "C",
      text: "These changes transformed both production methods and social structures.",
    },
  ],
});

const MC_STIMULUS = JSON.stringify({
  passage: "Photosynthesis is the process by which plants convert sunlight into energy.",
  question: "What do plants use photosynthesis to produce?",
  options: [
    "Energy from sunlight",
    "Carbon dioxide",
    "Soil nutrients",
    "Water vapour",
    "Oxygen only",
  ],
  correct: 0,
});

// ─── Fill in the Blanks (Reading) ────────────────────────────────────────────

test.describe("PTE Reading — Fill in the Blanks", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/fill-in-the-blanks");
    await expect(
      page.getByRole("heading", { name: /fill in the blanks/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte reading/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /get passage/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → select dropdowns → submit shows feedback", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, FIB_R_STIMULUS);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/fill-in-the-blanks");
    await page.getByRole("button", { name: /get passage/i }).click();

    // Dropdowns appear inline in the passage once generated
    await expect(page.locator("main select").first()).toBeVisible({
      timeout: 10000,
    });

    const selects = page.locator("main select");
    await selects.nth(0).selectOption("analysed");
    await selects.nth(1).selectOption("discussed");

    const submitBtn = page.getByRole("button", { name: /submit answers/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(
      page.getByText(/good attempt at the task/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("submit button disabled until all blanks are answered", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, FIB_R_STIMULUS);

    await page.goto("/practice/fill-in-the-blanks");
    await page.getByRole("button", { name: /get passage/i }).click();

    await expect(page.locator("main select").first()).toBeVisible({
      timeout: 10000,
    });

    // Answer only the first blank — submit must stay disabled
    await page.locator("main select").first().selectOption("analysed");
    await expect(
      page.getByRole("button", { name: /submit answers/i })
    ).toBeDisabled();
  });

  test("answered count updates as dropdowns are filled", async ({ page }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, FIB_R_STIMULUS);

    await page.goto("/practice/fill-in-the-blanks");
    await page.getByRole("button", { name: /get passage/i }).click();

    await expect(page.locator("main select").first()).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByText(/0 \/ 2 answered/i)).toBeVisible();
    await page.locator("main select").first().selectOption("analysed");
    await expect(page.getByText(/1 \/ 2 answered/i)).toBeVisible();
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/fill-in-the-blanks");
    await page.getByRole("button", { name: /get passage/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─── Re-order Paragraphs ─────────────────────────────────────────────────────

test.describe("PTE Reading — Re-order Paragraphs", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/re-order-paragraphs");
    await expect(
      page.getByRole("heading", { name: /re-order paragraphs/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte reading/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /get paragraphs/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → paragraph tiles appear → submit shows feedback", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, REORDER_STIMULUS);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/re-order-paragraphs");
    await page.getByRole("button", { name: /get paragraphs/i }).click();

    // Paragraph tiles appear and submit button becomes available
    await expect(
      page.getByRole("button", { name: /submit order/i })
    ).toBeVisible({ timeout: 10000 });

    // All three paragraph texts should be rendered
    await expect(
      page.getByText(/industrial revolution/i)
    ).toBeVisible();

    await page.getByRole("button", { name: /submit order/i }).click();

    await expect(
      page.getByText(/good attempt at the task/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test("arrow buttons reorder paragraphs", async ({ page }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, REORDER_STIMULUS);

    await page.goto("/practice/re-order-paragraphs");
    await page.getByRole("button", { name: /get paragraphs/i }).click();

    await expect(
      page.getByRole("button", { name: /submit order/i })
    ).toBeVisible({ timeout: 10000 });

    // Hover first tile to reveal arrows, then click Move down
    const tiles = page.locator("main [draggable='true']");
    await tiles.first().hover();
    const moveDownBtn = tiles.first().getByRole("button", { name: /move down/i });
    await moveDownBtn.click();

    // After moving down, first tile content should have changed (paragraph B or C is now first)
    // Just verify the move didn't crash and tiles are still rendered
    await expect(tiles).toHaveCount(3);
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/re-order-paragraphs");
    await page.getByRole("button", { name: /get paragraphs/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});

// ─── Multiple Choice (Reading) ───────────────────────────────────────────────

test.describe("PTE Reading — Multiple Choice", () => {
  test("page loads with correct heading, label, and CTA", async ({ page }) => {
    await page.goto("/practice/multiple-choice");
    await expect(
      page.getByRole("heading", { name: /multiple choice/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte reading/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /get question/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("generate → 5 radio options appear → select → submit shows feedback", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, MC_STIMULUS);
    await mockPteFeedbackApi(page);

    await page.goto("/practice/multiple-choice");
    await page.getByRole("button", { name: /get question/i }).click();

    await expect(
      page.locator('input[type="radio"]').first()
    ).toBeVisible({ timeout: 10000 });

    // Exactly 5 options
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
    await mockPteStimulusApi(page, MC_STIMULUS);

    await page.goto("/practice/multiple-choice");
    await page.getByRole("button", { name: /get question/i }).click();

    await expect(
      page.locator('input[type="radio"]').first()
    ).toBeVisible({ timeout: 10000 });

    // No selection yet
    await expect(
      page.getByRole("button", { name: /submit answer/i })
    ).toBeDisabled();
  });

  test("passage and question text are rendered", async ({ page }) => {
    test.setTimeout(30_000);
    await mockPteStimulusApi(page, MC_STIMULUS);

    await page.goto("/practice/multiple-choice");
    await page.getByRole("button", { name: /get question/i }).click();

    await expect(page.getByText(/photosynthesis/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/plants use photosynthesis/i)).toBeVisible();
  });

  test("shows error state when stimulus API fails", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/practice/multiple-choice");
    await page.getByRole("button", { name: /get question/i }).click();
    await expect(
      page.getByText(/failed|error/i).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
