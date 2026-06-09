import { test, expect } from "@playwright/test";

const SESSION_KEY = "echo_mock_session";

// All 15 PTE task types in exam order
const ALL_TASK_TYPES = [
  "personal_intro",
  "read_aloud",
  "repeat_sentence",
  "describe_image",
  "re_tell_lecture",
  "answer_short_question",
  "summarize_written_text",
  "write_essay",
  "fill_in_the_blanks_reading",
  "re_order_paragraphs",
  "multiple_choice_reading",
  "write_from_dictation",
  "summarize_spoken_text",
  "fill_in_the_blanks_listening",
  "highlight_correct_summary",
] as const;

function makeMockSession() {
  const startedAt = "2026-06-10T10:00:00.000Z";
  const completedAt = "2026-06-10T11:30:00.000Z";
  const tasks = ALL_TASK_TYPES.map((type, i) => ({
    id: `mock_test_${i}`,
    taskType: type,
    stimulus: { kind: "text", content: `Stimulus for ${type}` },
    response: { kind: "text", content: `Response for ${type}` },
    feedback: {
      summary: `Good attempt at this task.`,
      strengths: ["Clear response"],
      weaknesses: i % 3 === 0 ? ["Limited vocabulary range"] : ["Could improve accuracy"],
      suggestions: ["Practice regularly"],
    },
    durationSeconds: 60 + i * 5,
    createdAt: startedAt,
    endedAt: completedAt,
  }));
  return { tasks, startedAt, completedAt };
}

// ─── Intro Screen ─────────────────────────────────────────────────────────────

test.describe("Mock Exam — Intro Screen", () => {
  test("page loads with heading, PTE Academic label, and nav", async ({ page }) => {
    await page.goto("/mock");
    await expect(
      page.getByRole("heading", { name: /mock exam/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/pte academic/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /start mock exam/i })
    ).toBeVisible();
    await expect(page.locator("nav").first()).toBeVisible();
  });

  test("task list shows all 15 tasks and all four PTE sections", async ({ page }) => {
    await page.goto("/mock");
    await expect(
      page.getByRole("button", { name: /start mock exam/i })
    ).toBeVisible({ timeout: 10000 });

    // Spot-check representative tasks from each section
    await expect(page.getByText("Personal Introduction")).toBeVisible();
    await expect(page.getByText("Describe Image")).toBeVisible();
    await expect(page.getByText("Re-tell Lecture")).toBeVisible();
    await expect(page.getByText("Write Essay")).toBeVisible();
    await expect(page.getByText("Re-order Paragraphs")).toBeVisible();
    await expect(page.getByText("Highlight Correct Summary")).toBeVisible();

    // All four section labels present
    await expect(page.getByText("Speaking & Writing").first()).toBeVisible();
    await expect(page.getByText("Writing").first()).toBeVisible();
    await expect(page.getByText("Reading").first()).toBeVisible();
    await expect(page.getByText("Listening").first()).toBeVisible();

    // Task Sequence header reports 15 tasks
    await expect(page.getByText(/15 tasks/i)).toBeVisible();
  });

  test("clicking Start transitions to task 1 with progress header", async ({
    page,
  }) => {
    await page.goto("/mock");
    await expect(
      page.getByRole("button", { name: /start mock exam/i })
    ).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /start mock exam/i }).click();

    // Progress header shows task 1 of 15
    await expect(page.getByText(/task 1 of 15/i)).toBeVisible({
      timeout: 5000,
    });
    // Task label heading for Personal Introduction
    await expect(
      page.getByRole("heading", { name: /personal introduction/i })
    ).toBeVisible();
  });
});

// ─── Summary Page ─────────────────────────────────────────────────────────────

test.describe("Mock Exam — Summary Page", () => {
  test("no session shows fallback message and Start CTA", async ({ page }) => {
    await page.goto("/mock/summary");
    await expect(
      page.getByText(/no mock exam session found/i)
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("link", { name: /start a mock exam/i })
    ).toBeVisible();
  });

  test("with session renders Exam Complete heading and task count", async ({
    page,
  }) => {
    const session = makeMockSession();
    await page.addInitScript(
      ([key, data]) => window.sessionStorage.setItem(key, data),
      [SESSION_KEY, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/mock/summary");

    await expect(
      page.getByRole("heading", { name: /exam complete/i })
    ).toBeVisible({ timeout: 10000 });

    // Tasks Completed stat shows 15
    await expect(page.getByText("15").first()).toBeVisible();
    await expect(page.getByText(/tasks completed/i)).toBeVisible();
  });

  test("with session shows per-task breakdown for all 15 task types", async ({
    page,
  }) => {
    const session = makeMockSession();
    await page.addInitScript(
      ([key, data]) => window.sessionStorage.setItem(key, data),
      [SESSION_KEY, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/mock/summary");
    await expect(
      page.getByRole("heading", { name: /exam complete/i })
    ).toBeVisible({ timeout: 10000 });

    // One label from each of the four PTE sections (.first() because the label
    // also appears in the "Practice X →" link in the same breakdown row)
    await expect(page.getByText("Personal Introduction").first()).toBeVisible();
    await expect(page.getByText("Describe Image").first()).toBeVisible();
    await expect(page.getByText("Re-tell Lecture").first()).toBeVisible();
    await expect(page.getByText("Summarize Written Text").first()).toBeVisible();
    await expect(page.getByText("Fill in the Blanks (Reading)").first()).toBeVisible();
    await expect(page.getByText("Re-order Paragraphs").first()).toBeVisible();
    await expect(page.getByText("Write from Dictation").first()).toBeVisible();
    await expect(page.getByText("Summarize Spoken Text").first()).toBeVisible();
    await expect(page.getByText("Fill in the Blanks (Listening)").first()).toBeVisible();
    await expect(page.getByText("Highlight Correct Summary").first()).toBeVisible();
  });

  test("with session shows weaknesses section", async ({ page }) => {
    const session = makeMockSession();
    await page.addInitScript(
      ([key, data]) => window.sessionStorage.setItem(key, data),
      [SESSION_KEY, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/mock/summary");
    await expect(
      page.getByRole("heading", { name: /exam complete/i })
    ).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/key areas to improve/i)).toBeVisible();
    // "limited vocabulary range" appears in multiple tasks so it will be in top weaknesses
    await expect(
      page.getByText(/limited vocabulary range/i).first()
    ).toBeVisible();
  });

  test("with session shows practice links for each task type", async ({
    page,
  }) => {
    const session = makeMockSession();
    await page.addInitScript(
      ([key, data]) => window.sessionStorage.setItem(key, data),
      [SESSION_KEY, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/mock/summary");
    await expect(
      page.getByRole("heading", { name: /exam complete/i })
    ).toBeVisible({ timeout: 10000 });

    // Practice links exist for a representative set of task types
    await expect(
      page.getByRole("link", { name: /practice read aloud/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /practice describe image/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /practice re-tell lecture/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /practice highlight correct summary/i })
    ).toBeVisible();
  });

  test("with session shows action buttons to retake exam or view stats", async ({
    page,
  }) => {
    const session = makeMockSession();
    await page.addInitScript(
      ([key, data]) => window.sessionStorage.setItem(key, data),
      [SESSION_KEY, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/mock/summary");
    await expect(
      page.getByRole("heading", { name: /exam complete/i })
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByRole("link", { name: /take another mock exam/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /practice individual tasks/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /view progress/i })
    ).toBeVisible();
  });
});
