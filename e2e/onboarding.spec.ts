import { test, expect } from "@playwright/test";
import { mockAudioAutoEnd, mockPracticeApis } from "./helpers";

const FIB_L_STIMULUS = JSON.stringify({
  passage: "The scientists [BLANK_0] new data every day, which helps them [BLANK_1] their theories.",
  blanks: [
    { options: ["collect", "ignore", "forget"], correct: 0 },
    { options: ["refine", "abandon", "discard"], correct: 0 },
  ],
});

const MC_STIMULUS = JSON.stringify({
  passage: "Photosynthesis is the process by which plants convert sunlight into energy.",
  question: "What do plants use photosynthesis to produce?",
  options: ["Energy from sunlight", "Carbon dioxide", "Soil nutrients", "Water vapour", "Oxygen only"],
  correct: 0,
});

const STIMULI = [
  {
    task_type: "read_aloud", label: "Read Aloud", section: "Speaking",
    instruction: "Read the passage aloud. You have 30 seconds to record.",
    stimulus: "Cities grow when people move closer to work.", time_limit: 30,
  },
  {
    task_type: "fill_in_the_blanks_listening", label: "Fill in the Blanks", section: "Listening",
    instruction: "Listen and choose the missing words.", stimulus: FIB_L_STIMULUS, time_limit: 180,
  },
  {
    task_type: "summarize_written_text", label: "Summarise Written Text", section: "Writing",
    instruction: "Summarise the passage in one sentence.",
    stimulus: "Urban gardens improve air quality and bring neighbours together.", time_limit: 60,
  },
  {
    task_type: "multiple_choice_reading", label: "Multiple Choice", section: "Reading",
    instruction: "Read the passage and choose the best answer.", stimulus: MC_STIMULUS, time_limit: 120,
  },
];

const RESULT = {
  weaknessProfile: {
    section_scores: { speaking: 55, writing: 62, reading: 70, listening: 48 },
    weakest_section: "listening",
    key_weaknesses: ["Misses unstressed words"],
    summary: "Listening needs the most attention.",
  },
  learningPlan: {
    recommended_first_task: "write_from_dictation",
    first_week: [{ day: 1, tasks: ["write_from_dictation"], focus: "Short dictation drills" }],
    study_tips: ["Listen once, then write"],
  },
};

type EvaluatedTask = { task_type: string; stimulus: string; response: string };

test.describe("Onboarding diagnostic", () => {
  test("four tasks are answered in turn and evaluated together", async ({ page }) => {
    test.setTimeout(60_000);
    await mockAudioAutoEnd(page);
    await mockPracticeApis(page);

    // The diagnostic must not ask for per-task Stimuli or Feedback.
    const perTaskCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/pte\/(stimulus|feedback|spoken-feedback)/.test(request.url())) {
        perTaskCalls.push(request.url());
      }
    });

    await page.route("**/api/onboarding/stimuli", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stimuli: STIMULI }) })
    );
    let evaluated: EvaluatedTask[] = [];
    await page.route("**/api/onboarding/evaluate", (route) => {
      evaluated = (route.request().postDataJSON() as { tasks: EvaluatedTask[] }).tasks;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESULT) });
    });

    await page.goto("/onboarding");
    await page.getByRole("button", { name: "开始测评" }).click();

    // 1. Read Aloud: skip the preparation time, record, stop once allowed.
    await expect(page.getByRole("heading", { name: "Read Aloud" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/cities grow when people move/i)).toBeVisible();
    await page.getByRole("button", { name: /record now/i }).click();
    const stop = page.getByRole("button", { name: /stop/i });
    await expect(stop).toBeEnabled({ timeout: 15000 });
    await stop.click();

    // 2. Fill in the Blanks (Listening): play, choose, submit.
    await expect(page.getByRole("heading", { name: "Fill in the Blanks" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /play passage/i }).click();
    const selects = page.locator("main select");
    await selects.nth(0).selectOption("collect");
    await selects.nth(1).selectOption("abandon");
    await page.getByRole("button", { name: /submit/i }).click();

    // 3. Summarize Written Text.
    await expect(page.getByRole("heading", { name: "Summarise Written Text" })).toBeVisible({ timeout: 10000 });
    await page.locator("textarea").fill("Urban gardens clean the air and connect neighbours.");
    await page.getByRole("button", { name: /submit/i }).click();

    // 4. Multiple Choice (Reading).
    await expect(page.getByRole("heading", { name: "Multiple Choice" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Energy from sunlight" }).click();
    await page.getByRole("button", { name: /submit/i }).click();

    await expect(page.getByText("Listening needs the most attention.")).toBeVisible({ timeout: 10000 });

    expect(evaluated.map((task) => task.task_type)).toEqual(STIMULI.map((item) => item.task_type));
    expect(evaluated[0].stimulus).toBe(STIMULI[0].stimulus);
    expect(evaluated[0].response.length).toBeGreaterThan(0);
    expect(evaluated[1].response).toContain('Blank 1: selected "collect" (correct: "collect") ✓');
    expect(evaluated[1].response).toContain('Blank 2: selected "abandon" (correct: "refine") ✗');
    expect(evaluated[2].response).toBe("Urban gardens clean the air and connect neighbours.");
    expect(evaluated[3].response).toBe("Selected: Energy from sunlight ✓ (correct)");
    expect(perTaskCalls).toEqual([]);
  });

  test("a failed Stimulus request returns to the welcome screen with the error", async ({ page }) => {
    await page.route("**/api/onboarding/stimuli", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "开始测评" }).click();
    await expect(page.getByRole("button", { name: "开始测评" })).toBeEnabled({ timeout: 15000 });
    await expect(page.locator("p.text-red-600")).toBeVisible();
  });
});
