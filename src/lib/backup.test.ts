import { describe, expect, it } from "vitest";
import { validateBackup } from "./backup";
import type { BackupData } from "./backup";

const validBackup: BackupData = {
  version: "1.0.0",
  createdAt: "2026-05-17T00:00:00.000Z",
  sessions: [
    {
      id: "session-1",
      mode: "ielts_part_1",
      messages: [
        {
          id: "message-1",
          role: "examiner",
          content: "Where are you from?",
          createdAt: "2026-05-17T00:00:00.000Z",
        },
      ],
      feedback: {
        estimatedBand: 6.5,
        fluencyAndCoherence: "Clear enough.",
        lexicalResource: "Some range.",
        grammarRangeAndAccuracy: "Mostly accurate.",
        pronunciation: "Understandable.",
        strengths: ["Clear answer"],
        weaknesses: ["Needs detail"],
        improvementSuggestions: ["Extend answers"],
        improvedSampleAnswer: "I come from a coastal city...",
      },
      createdAt: "2026-05-17T00:00:00.000Z",
      endedAt: "2026-05-17T00:05:00.000Z",
    },
  ],
  goals: null,
  settings: {
    voiceURI: null,
    voiceRate: null,
    muted: null,
  },
};

describe("validateBackup", () => {
  it("accepts a well formed backup", () => {
    expect(validateBackup(validBackup)).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(validateBackup({ ...validBackup, version: undefined })).toBe(false);
    expect(validateBackup({ ...validBackup, sessions: {} })).toBe(false);
  });

  it("rejects malformed sessions", () => {
    expect(
      validateBackup({
        ...validBackup,
        sessions: [{ ...validBackup.sessions[0], feedback: null }],
      })
    ).toBe(false);

    expect(
      validateBackup({
        ...validBackup,
        sessions: [
          {
            ...validBackup.sessions[0],
            feedback: {
              ...validBackup.sessions[0].feedback,
              estimatedBand: "6.5",
            },
          },
        ],
      })
    ).toBe(false);
  });
});
