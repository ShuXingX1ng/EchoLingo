import { describe, it, expect } from "vitest"
import { parsePracticeModeFromUrl, buildStimulusExtras } from "./practice-mode"

describe("parsePracticeModeFromUrl", () => {
  it("returns random mode when search string is empty", () => {
    expect(parsePracticeModeFromUrl("")).toEqual({ mode: "random", topic: undefined })
  })

  it("returns theme mode with topic when both present", () => {
    expect(parsePracticeModeFromUrl("?mode=theme&topic=technology")).toEqual({
      mode: "theme",
      topic: "technology",
    })
  })

  it("returns targeted mode without topic", () => {
    expect(parsePracticeModeFromUrl("?mode=targeted")).toEqual({
      mode: "targeted",
      topic: undefined,
    })
  })

  it("falls back to random for unknown mode values", () => {
    expect(parsePracticeModeFromUrl("?mode=invalid")).toEqual({
      mode: "random",
      topic: undefined,
    })
  })

  it("returns topic even for non-theme modes (not filtered here)", () => {
    const result = parsePracticeModeFromUrl("?mode=random&topic=science")
    expect(result.mode).toBe("random")
    expect(result.topic).toBe("science")
  })

  it("handles URL-encoded topic values", () => {
    const result = parsePracticeModeFromUrl("?mode=theme&topic=artificial%20intelligence")
    expect(result.mode).toBe("theme")
    expect(result.topic).toBe("artificial intelligence")
  })

  it("returns undefined topic when topic param is absent", () => {
    const result = parsePracticeModeFromUrl("?mode=theme")
    expect(result.mode).toBe("theme")
    expect(result.topic).toBeUndefined()
  })
})

describe("buildStimulusExtras", () => {
  it("returns empty object for random mode", () => {
    expect(buildStimulusExtras("random", undefined)).toEqual({})
    expect(buildStimulusExtras("random", "science")).toEqual({})
  })

  it("returns mode and topic for theme mode with topic", () => {
    expect(buildStimulusExtras("theme", "environment")).toEqual({
      mode: "theme",
      topic: "environment",
    })
  })

  it("returns only mode for theme mode without topic", () => {
    const extras = buildStimulusExtras("theme", undefined)
    expect(extras.mode).toBe("theme")
    expect("topic" in extras).toBe(false)
  })

  it("returns only mode for targeted mode (no topic)", () => {
    expect(buildStimulusExtras("targeted", undefined)).toEqual({ mode: "targeted" })
  })

  it("does not include topic in targeted mode extras", () => {
    const extras = buildStimulusExtras("targeted", "environment")
    expect(extras.mode).toBe("targeted")
    expect("topic" in extras).toBe(false)
  })
})
