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
