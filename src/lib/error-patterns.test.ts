import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  updateErrorPatterns,
  getUserProfile,
} from "./error-patterns";
import type { ErrorAnnotation } from "@/types";

// Mock localStorage
const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(store)) delete store[key];
  }),
  get length() {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
};

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Mock Supabase error patterns module — keep inferTypeFromText real so localStorage logic works
vi.mock("./supabase-error-patterns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase-error-patterns")>();
  return {
    ...actual,
    updateErrorPatternsFromFeedback: vi.fn().mockResolvedValue(undefined),
  };
});

const USER_ID = "test-user-1";

const baseFeedback = {
  grammarRangeAndAccuracy: "Good range.",
  lexicalResource: "Adequate vocabulary.",
  fluencyAndCoherence: "Fluent enough.",
  pronunciation: "Clear.",
  weaknesses: ["Limited complex vocabulary"],
};

describe("updateErrorPatterns", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("creates a profile from weaknesses when none exists", async () => {
    const profile = await updateErrorPatterns(USER_ID, baseFeedback);

    expect(profile.userId).toBe(USER_ID);
    expect(profile.practiceCount).toBe(1);
    expect(profile.commonErrors).toHaveLength(1);
    expect(profile.commonErrors[0].pattern).toBe("Limited complex vocabulary");
    expect(profile.commonErrors[0].type).toBe("vocabulary");
    expect(profile.commonErrors[0].frequency).toBe(1);
  });

  it("increments frequency for duplicate weaknesses", async () => {
    await updateErrorPatterns(USER_ID, baseFeedback);
    const profile = await updateErrorPatterns(USER_ID, baseFeedback);

    expect(profile.commonErrors).toHaveLength(1);
    expect(profile.commonErrors[0].frequency).toBe(2);
    expect(profile.practiceCount).toBe(2);
  });

  it("infers grammar type from weakness text", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses: ["Grammar errors with tense usage"],
    });

    expect(profile.commonErrors[0].type).toBe("grammar");
  });

  it("infers pronunciation type from weakness text", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses: ["Pronunciation of certain sounds"],
    });

    expect(profile.commonErrors[0].type).toBe("pronunciation");
  });

  it("defaults to fluency type when no keywords match", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses: ["Hesitation and long pauses"],
    });

    expect(profile.commonErrors[0].type).toBe("fluency");
  });

  it("extracts patterns from errorAnnotations", async () => {
    const annotations: ErrorAnnotation[] = [
      {
        original: "I goed to school",
        corrected: "I went to school",
        type: "grammar",
        explanation: "Past tense irregular verb",
      },
      {
        original: "I am agree",
        corrected: "I agree",
        type: "vocabulary",
        explanation: "No article needed",
      },
    ];

    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      errorAnnotations: annotations,
    });

    // 1 weakness + 2 annotations = 3 patterns
    expect(profile.commonErrors).toHaveLength(3);

    const grammarPattern = profile.commonErrors.find(
      (p) => p.type === "grammar"
    );
    expect(grammarPattern).toBeTruthy();
    expect(grammarPattern!.examples).toContain("I goed to school");
    expect(grammarPattern!.improvement).toBe("Past tense irregular verb");
  });

  it("merges duplicate annotation patterns and accumulates examples", async () => {
    const feedback1 = {
      ...baseFeedback,
      errorAnnotations: [
        {
          original: "I goed",
          corrected: "went",
          type: "grammar" as const,
          explanation: "Irregular verb",
        },
      ],
    };
    const feedback2 = {
      ...baseFeedback,
      weaknesses: [],
      errorAnnotations: [
        {
          original: "she goed",
          corrected: "went",
          type: "grammar" as const,
          explanation: "Irregular verb",
        },
      ],
    };

    await updateErrorPatterns(USER_ID, feedback1);
    const profile = await updateErrorPatterns(USER_ID, feedback2);

    const grammarPattern = profile.commonErrors.find(
      (p) => p.type === "grammar" && p.pattern === "went"
    );
    expect(grammarPattern).toBeTruthy();
    expect(grammarPattern!.frequency).toBe(2);
    expect(grammarPattern!.examples).toContain("I goed");
    expect(grammarPattern!.examples).toContain("she goed");
  });

  it("enriches patterns with improvementSuggestions", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      improvementSuggestions: [
        "Practice using more advanced vocabulary",
        "Work on grammar accuracy",
      ],
    });

    const vocabPattern = profile.commonErrors.find(
      (p) => p.type === "vocabulary"
    );
    expect(vocabPattern).toBeTruthy();
    expect(vocabPattern!.improvement).toBe(
      "Practice using more advanced vocabulary"
    );
  });

  it("does not overwrite existing improvement from annotations", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses: [],
      errorAnnotations: [
        {
          original: "I goed",
          corrected: "went",
          type: "grammar" as const,
          explanation: "Irregular verb form",
        },
      ],
      improvementSuggestions: ["Grammar practice needed"],
    });

    const grammarPattern = profile.commonErrors.find(
      (p) => p.type === "grammar"
    );
    // Should keep the annotation explanation, not overwrite with suggestion
    expect(grammarPattern!.improvement).toBe("Irregular verb form");
  });

  it("handles missing errorAnnotations gracefully (backward compat)", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      // no errorAnnotations field
    });

    expect(profile.commonErrors).toHaveLength(1);
    expect(profile.commonErrors[0].pattern).toBe("Limited complex vocabulary");
  });

  it("handles missing improvementSuggestions gracefully (backward compat)", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      // no improvementSuggestions field
    });

    expect(profile.commonErrors).toHaveLength(1);
    expect(profile.commonErrors[0].improvement).toBeUndefined();
  });

  it("handles empty errorAnnotations array", async () => {
    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      errorAnnotations: [],
    });

    expect(profile.commonErrors).toHaveLength(1);
  });

  it("limits examples to 5 per pattern", async () => {
    let profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses: [],
      errorAnnotations: [
        { original: "err1", corrected: "fix1", type: "grammar", explanation: "e1" },
      ],
    });

    for (let i = 2; i <= 7; i++) {
      profile = await updateErrorPatterns(USER_ID, {
        ...baseFeedback,
        weaknesses: [],
        errorAnnotations: [
          {
            original: `err${i}`,
            corrected: "fix1",
            type: "grammar",
            explanation: `e${i}`,
          },
        ],
      });
    }

    const pattern = profile.commonErrors.find((p) => p.pattern === "fix1");
    expect(pattern!.examples.length).toBeLessThanOrEqual(5);
  });

  it("caps commonErrors at 20 entries", async () => {
    const weaknesses = Array.from({ length: 25 }, (_, i) => `Weakness ${i}`);

    const profile = await updateErrorPatterns(USER_ID, {
      ...baseFeedback,
      weaknesses,
    });

    expect(profile.commonErrors.length).toBeLessThanOrEqual(20);
  });
});

describe("getUserProfile", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns null when no profile exists", () => {
    expect(getUserProfile("nonexistent")).toBeNull();
  });

  it("returns saved profile", async () => {
    await updateErrorPatterns(USER_ID, baseFeedback);
    const profile = getUserProfile(USER_ID);

    expect(profile).toBeTruthy();
    expect(profile!.userId).toBe(USER_ID);
  });
});

