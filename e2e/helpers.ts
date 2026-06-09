import type { Page } from "@playwright/test";

/** Mock examiner API to return a fixed response */
export async function mockExaminerApi(page: Page) {
  await page.route("**/api/examiner", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "That's interesting. Can you tell me more about your hometown?",
      }),
    })
  );
}

/** Mock feedback API to return a fixed SessionFeedback */
export async function mockFeedbackApi(page: Page) {
  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        estimatedBand: 6.5,
        fluencyAndCoherence: "Good fluency with minor hesitations.",
        lexicalResource: "Adequate vocabulary range.",
        grammarRangeAndAccuracy: "Mix of simple and complex structures.",
        pronunciation: "Clear pronunciation overall.",
        strengths: ["Good use of examples", "Clear structure"],
        weaknesses: ["Limited complex vocabulary", "Some grammar errors"],
        improvementSuggestions: [
          "Practice using more advanced vocabulary",
          "Work on linking words",
        ],
        improvedSampleAnswer:
          "I come from a beautiful coastal city in the south of China. It's known for its stunning beaches and fresh seafood.",
        errorAnnotations: [
          {
            original: "I am live in city",
            corrected: "I live in the city",
            type: "grammar",
            explanation: "Remove 'am' and add article 'the'",
          },
        ],
      }),
    })
  );
}

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

/** Mock pronunciation API */
export async function mockPronunciationApi(page: Page) {
  await page.route("**/api/pronunciation", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        score: 85,
        accuracyScore: 82,
        fluencyScore: 88,
        completenessScore: 91,
        words: [{ word: "hello", score: 90, accuracyScore: 88 }],
        summary: "Good pronunciation.",
      }),
    })
  );
}

/** Set up all API mocks for a standard practice session */
export async function mockAllApis(page: Page) {
  await mockExaminerApi(page);
  await mockFeedbackApi(page);
  await mockTtsApi(page);
  await mockPronunciationApi(page);
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
