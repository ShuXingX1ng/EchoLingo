import type { Page } from "@playwright/test";

/** Mock TTS API to return an empty audio blob */
export async function mockTtsApi(page: Page) {
  await page.route("**/api/tts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/mpeg",
      body: Buffer.from([]),
    })
  );
}

/** Mock the one-request speech evaluation + Feedback for a recorded Response */
export async function mockSpokenFeedbackApi(page: Page) {
  const speechEvaluation = {
    provider: "echolingo",
    scale: "10-90",
    taskScoreEstimate: 74,
    overallScore: null,
    pronunciation: 72,
    oralFluency: 70,
    content: 90,
    recognizedText: "hello",
    words: [{ word: "hello", score: 80, status: "correct" }],
    evidenceStatus: {
      sentence: { status: "available" },
      word: { status: "available" },
      phoneme: { status: "available" },
    },
    modelId: "speech-evaluator-v0.1.0",
    warnings: [],
    summary: "",
  };
  await page.route("**/api/pte/spoken-feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        transcript: "hello",
        speechEvaluation,
        speechEvaluationError: null,
        speechEvaluationComparison: null,
        feedback: {
          summary: "Good attempt at the task.",
          strengths: ["Clear response"],
          weaknesses: ["Could improve accuracy"],
          suggestions: ["Practice more"],
          speechEvaluation,
        },
      }),
    })
  );
}

/** Set up all API mocks for a standard practice session */
export async function mockAllApis(page: Page) {
  await mockTtsApi(page);
  await mockSpokenFeedbackApi(page);
}

/** Mock PTE stimulus API with a given text payload */
export async function mockPteStimulusApi(page: Page, responseText: string) {
  await page.route("**/api/pte/stimulus", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ text: responseText }),
    })
  );
}

/** Mock PTE feedback API with a minimal TaskFeedback response */
export async function mockPteFeedbackApi(page: Page) {
  await page.route("**/api/pte/feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: "Good attempt at the task.",
        strengths: ["Clear response"],
        weaknesses: ["Could improve accuracy"],
        suggestions: ["Practice more listening tasks"],
      }),
    })
  );
}

/**
 * Mock every backend call a Task Practice page can make. A page loads its
 * Stimulus as soon as it opens, so a test that only checks the page renders
 * still needs these to stay off the real (paid) services.
 */
export async function mockPracticeApis(
  page: Page,
  stimulusText = "Regular exercise improves memory and concentration in adults of all ages."
) {
  await mockAllApis(page);
  await mockPteStimulusApi(page, stimulusText);
  await mockPteFeedbackApi(page);
}

/**
 * Override window.Audio so that play() immediately fires onended after 50ms.
 * Call this before page.goto() — it runs via addInitScript on every page load.
 * Enables tests to progress through audio-gated UI phases without real audio.
 */
export async function mockAudioAutoEnd(page: Page) {
  await page.addInitScript(() => {
    window.Audio = class FakeAudio {
      src: string;
      onended: ((e: Event) => void) | null = null;
      constructor(src = "") {
        this.src = src;
      }
      play() {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            if (this.onended) this.onended(new Event("ended"));
            resolve();
          }, 50);
        });
      }
      pause() {}
    } as unknown as typeof Audio;
  });
}
