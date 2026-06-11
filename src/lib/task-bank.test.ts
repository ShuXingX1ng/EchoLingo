import { describe, expect, it, beforeEach, vi } from "vitest"
import { getStimulusFromBank, addStimulusToBank, getBankSize, clearBankForType, clearAllBank } from "./task-bank"

// ── localStorage stub ─────────────────────────────────────────────────────────

const store: Record<string, string> = {}

const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
}

vi.stubGlobal("localStorage", localStorageMock)

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("task-bank", () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  describe("getStimulusFromBank", () => {
    it("returns null when bank is empty", () => {
      expect(getStimulusFromBank("read_aloud")).toBeNull()
    })

    it("returns a stored stimulus", () => {
      addStimulusToBank("read_aloud", "The quick brown fox.")
      expect(getStimulusFromBank("read_aloud")).toBe("The quick brown fox.")
    })

    it("returns one of multiple stored stimuli", () => {
      addStimulusToBank("read_aloud", "Stimulus A")
      addStimulusToBank("read_aloud", "Stimulus B")
      const result = getStimulusFromBank("read_aloud")
      expect(["Stimulus A", "Stimulus B"]).toContain(result)
    })

    it("returns null for a different task type", () => {
      addStimulusToBank("read_aloud", "Stimulus A")
      expect(getStimulusFromBank("write_essay")).toBeNull()
    })
  })

  describe("addStimulusToBank", () => {
    it("adds a stimulus and increases bank size", () => {
      addStimulusToBank("repeat_sentence", "Hello world.")
      expect(getBankSize("repeat_sentence")).toBe(1)
    })

    it("deduplicates identical stimuli", () => {
      addStimulusToBank("repeat_sentence", "Hello world.")
      addStimulusToBank("repeat_sentence", "Hello world.")
      expect(getBankSize("repeat_sentence")).toBe(1)
    })

    it("caps pool at 10 entries by evicting the oldest", () => {
      for (let i = 0; i < 12; i++) {
        addStimulusToBank("write_essay", `Stimulus ${i}`)
      }
      expect(getBankSize("write_essay")).toBe(10)
      // Oldest entries (0, 1) should have been evicted; newest (2–11) should remain
      const result = getStimulusFromBank("write_essay")!
      const index = parseInt(result.replace("Stimulus ", ""), 10)
      expect(index).toBeGreaterThanOrEqual(2)
    })

    it("stores stimuli independently per task type", () => {
      addStimulusToBank("read_aloud", "RA passage")
      addStimulusToBank("write_essay", "WE prompt")
      expect(getBankSize("read_aloud")).toBe(1)
      expect(getBankSize("write_essay")).toBe(1)
      expect(getStimulusFromBank("read_aloud")).toBe("RA passage")
      expect(getStimulusFromBank("write_essay")).toBe("WE prompt")
    })
  })

  describe("getBankSize", () => {
    it("returns 0 for an empty bank", () => {
      expect(getBankSize("personal_intro")).toBe(0)
    })

    it("returns correct count after additions", () => {
      addStimulusToBank("personal_intro", "A")
      addStimulusToBank("personal_intro", "B")
      addStimulusToBank("personal_intro", "C")
      expect(getBankSize("personal_intro")).toBe(3)
    })
  })

  describe("clearBankForType", () => {
    it("removes all stimuli for the given task type", () => {
      addStimulusToBank("read_aloud", "Passage A")
      addStimulusToBank("read_aloud", "Passage B")
      clearBankForType("read_aloud")
      expect(getBankSize("read_aloud")).toBe(0)
      expect(getStimulusFromBank("read_aloud")).toBeNull()
    })

    it("does not affect other task types", () => {
      addStimulusToBank("read_aloud", "Passage A")
      addStimulusToBank("write_essay", "Essay prompt")
      clearBankForType("read_aloud")
      expect(getBankSize("write_essay")).toBe(1)
    })
  })

  describe("clearAllBank", () => {
    it("removes all stimuli for all task types", () => {
      addStimulusToBank("read_aloud", "Passage A")
      addStimulusToBank("write_essay", "Essay prompt")
      addStimulusToBank("repeat_sentence", "Sentence X")
      clearAllBank()
      expect(getBankSize("read_aloud")).toBe(0)
      expect(getBankSize("write_essay")).toBe(0)
      expect(getBankSize("repeat_sentence")).toBe(0)
    })
  })
})
