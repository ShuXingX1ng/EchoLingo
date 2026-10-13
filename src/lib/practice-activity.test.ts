import { describe, it, expect } from "vitest"
import { practicedToday, streakDays, tasksThisWeek } from "./practice-activity"

// Wednesday 14 October 2026, mid-afternoon local time.
const NOW = new Date(2026, 9, 14, 15, 0, 0)

function on(daysAgo: number, hour = 10) {
  const date = new Date(NOW)
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, 0, 0, 0)
  return { createdAt: date.toISOString() }
}

describe("practicedToday", () => {
  it("is true only when a Practice Task was done today", () => {
    expect(practicedToday([on(0)], NOW)).toBe(true)
    expect(practicedToday([on(1)], NOW)).toBe(false)
    expect(practicedToday([], NOW)).toBe(false)
  })
})

describe("streakDays", () => {
  it("counts consecutive days ending today", () => {
    expect(streakDays([on(0), on(1), on(2)], NOW)).toBe(3)
  })

  it("counts several Practice Tasks on one day once", () => {
    expect(streakDays([on(0, 9), on(0, 11), on(1)], NOW)).toBe(2)
  })

  it("keeps a streak that ended yesterday alive until today is over", () => {
    expect(streakDays([on(1), on(2)], NOW)).toBe(2)
  })

  it("stops at the first missed day", () => {
    expect(streakDays([on(0), on(1), on(3), on(4)], NOW)).toBe(2)
  })

  it("is zero without recent practice", () => {
    expect(streakDays([on(2)], NOW)).toBe(0)
    expect(streakDays([], NOW)).toBe(0)
  })
})

describe("tasksThisWeek", () => {
  it("counts Practice Tasks since Monday", () => {
    // Monday is 2 days before NOW; 3 days ago is the previous Sunday.
    expect(tasksThisWeek([on(0), on(1), on(2), on(3), on(8)], NOW)).toBe(3)
  })

  it("treats Sunday as the last day of the week", () => {
    const sunday = new Date(2026, 9, 18, 12, 0, 0)
    const monday = { createdAt: new Date(2026, 9, 12, 8, 0, 0).toISOString() }
    const previousSunday = { createdAt: new Date(2026, 9, 11, 20, 0, 0).toISOString() }
    expect(tasksThisWeek([monday, previousSunday], sunday)).toBe(1)
  })
})
