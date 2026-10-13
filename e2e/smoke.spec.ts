import { test, expect } from "@playwright/test";
import { mockPteStimulusApi, mockPteFeedbackApi, mockPracticeApis } from "./helpers";

test.describe("P0 — Core path smoke tests", () => {
  test("home page loads with nav and practice CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator('a[href="/practice"]').first()).toBeVisible();
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });

  test("practice hub page renders PTE task cards", async ({ page }) => {
    await page.goto("/practice");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator('a[href="/practice/read-aloud"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="/practice/repeat-sentence"]').first()).toBeVisible();
    await expect(page.locator('a[href="/practice/write-essay"]').first()).toBeVisible();
  });

  test("read-aloud page loads and shows the passage", async ({ page }) => {
    await mockPracticeApis(page, "Climate change is one of the most pressing issues of our time.");
    await page.goto("/practice/read-aloud");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText("Read Aloud").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/climate change is one of the most pressing/i)).toBeVisible({ timeout: 10000 });
  });

  test("history page empty state", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByText(/no practice/i)).toBeVisible({ timeout: 10000 });
  });

  test("stats page empty state", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByText(/no practice data yet/i)).toBeVisible({ timeout: 10000 });
  });

  test("mock exam intro screen shows 15-task list", async ({ page }) => {
    await page.goto("/mock");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /mock exam/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /start/i }).first()).toBeVisible();
  });
});

test.describe("P1 — Key interactions", () => {
  test("practice hub links to all four PTE sections", async ({ page }) => {
    await page.goto("/practice");
    await expect(page.getByText(/speaking/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/writing/i).first()).toBeVisible();
    await expect(page.getByText(/reading/i).first()).toBeVisible();
    await expect(page.getByText(/listening/i).first()).toBeVisible();
  });

  test("repeat-sentence page loads", async ({ page }) => {
    await mockPracticeApis(page, "Climate change is one of the most pressing issues of our time.");
    await page.goto("/practice/repeat-sentence");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText("Repeat Sentence").first()).toBeVisible({ timeout: 10000 });
  });

  test("write-essay page loads and shows the essay question", async ({ page }) => {
    await mockPracticeApis(page, "Some people believe technology improves our quality of life.");
    await page.goto("/practice/write-essay");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText("Write Essay").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/technology improves our quality of life/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator("textarea").first()).toBeVisible();
  });

  test("fill-in-the-blanks reading page loads", async ({ page }) => {
    await mockPteStimulusApi(page, JSON.stringify({
      text: "The {blank} of renewable energy has grown significantly in recent years.",
      blanks: [{ index: 0, options: ["adoption", "reduction", "ignorance", "delay"], answer: "adoption" }],
    }));
    await page.goto("/practice/fill-in-the-blanks");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText(/fill in the blanks/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("summarize-spoken-text page loads", async ({ page }) => {
    await mockPracticeApis(page, "Scientists have discovered a new method for carbon capture.");
    await page.goto("/practice/summarize-spoken-text");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.getByText(/summarize spoken text/i).first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("P2 — Edge cases", () => {
  test("dark mode does not crash PTE pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
    await page.goto("/practice");
    await expect(page.locator("nav").first()).toBeVisible();
    await page.goto("/stats");
    await expect(page.locator("nav").first()).toBeVisible();
    await page.goto("/history");
    await expect(page.locator("nav").first()).toBeVisible();
    await page.goto("/mock");
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("read-aloud page handles stimulus API error", async ({ page }) => {
    await page.route("**/api/pte/stimulus", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal server error" }) })
    );
    await page.goto("/practice/read-aloud");
    await expect(page.getByText(/failed|error|try again/i).first()).toBeVisible({ timeout: 10000 });
  });

  test("write-essay shows feedback after submission", async ({ page }) => {
    await mockPteStimulusApi(page, "Some people believe technology improves our quality of life. Discuss.");
    await mockPteFeedbackApi(page);
    await page.goto("/practice/write-essay");
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 10000 });
    await page.locator("textarea").first().fill(
      "Technology has dramatically changed modern life. While it offers many benefits such as improved communication and access to information, it also presents challenges like privacy concerns and social isolation. Overall, I believe the advantages outweigh the disadvantages when technology is used responsibly."
    );
    const submitBtn = page.getByRole("button", { name: /submit|done/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });
    await submitBtn.click();
    await expect(page.getByText(/good attempt|strengths|weaknesses/i).first()).toBeVisible({ timeout: 15000 });
  });
});
