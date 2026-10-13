import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./task-history", () => ({
  saveTask: vi.fn(),
  getTasks: vi.fn(() => []),
  deleteTask: vi.fn(() => false),
  getTasksByType: vi.fn(() => []),
  clearAllTasks: vi.fn(),
}))

vi.mock("./supabase-task-history", () => ({
  isUserLoggedIn: vi.fn(),
  saveTaskToCloud: vi.fn(),
  getTasksFromCloud: vi.fn(() => []),
  clearTasksFromCloud: vi.fn(async () => true),
  deleteTaskFromCloud: vi.fn(() => false),
  getTasksByTypeFromCloud: vi.fn(() => []),
}))

import * as unified from "./unified-task-history"
import { _resetCacheForTesting } from "./unified-task-history"
import * as local from "./task-history"
import * as cloud from "./supabase-task-history"
import type { PracticeTask } from "@/types"

const TASK_STUB: Omit<PracticeTask, "id"> = {
  taskType: "read_aloud",
  stimulus: { kind: "text", content: "Test passage." },
  response: { kind: "audio", content: "" },
  feedback: { summary: "Good.", strengths: [], weaknesses: [], suggestions: [] },
  durationSeconds: 30,
  createdAt: new Date().toISOString(),
}

const CLOUD_TASK: PracticeTask = { ...TASK_STUB, id: "cloud-1" }
const LOCAL_TASK: PracticeTask = { ...TASK_STUB, id: "local-1" }

describe("unified-task-history", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the login/list caches so each test gets a fresh isLoggedIn() call
    // rather than a stale cached result from the previous test.
    _resetCacheForTesting()
  })

  // ── saveTask ─────────────────────────────────────────────────────────────────

  describe("saveTask", () => {
    it("saves to cloud and mirrors to local when authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.saveTaskToCloud).mockResolvedValue(CLOUD_TASK)

      const result = await unified.saveTask(TASK_STUB)

      expect(cloud.saveTaskToCloud).toHaveBeenCalledWith(TASK_STUB)
      expect(local.saveTask).toHaveBeenCalledWith(TASK_STUB)
      expect(result).toEqual(CLOUD_TASK)
    })

    it("falls back to local when cloud save returns null", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.saveTaskToCloud).mockResolvedValue(null)
      vi.mocked(local.saveTask).mockReturnValue(LOCAL_TASK)

      const result = await unified.saveTask(TASK_STUB)

      expect(local.saveTask).toHaveBeenCalledWith(TASK_STUB)
      expect(result).toEqual(LOCAL_TASK)
    })

    it("falls back to local when cloud save throws", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.saveTaskToCloud).mockRejectedValue(new Error("Network error"))
      vi.mocked(local.saveTask).mockReturnValue(LOCAL_TASK)

      const result = await unified.saveTask(TASK_STUB)

      expect(result).toEqual(LOCAL_TASK)
    })

    it("saves to local only when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)
      vi.mocked(local.saveTask).mockReturnValue(LOCAL_TASK)

      const result = await unified.saveTask(TASK_STUB)

      expect(cloud.saveTaskToCloud).not.toHaveBeenCalled()
      expect(local.saveTask).toHaveBeenCalledWith(TASK_STUB)
      expect(result).toEqual(LOCAL_TASK)
    })
  })

  // ── getTasks ─────────────────────────────────────────────────────────────────

  describe("getTasks", () => {
    it("returns cloud tasks when authenticated and cloud has data", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksFromCloud).mockResolvedValue([CLOUD_TASK])

      const result = await unified.getTasks()

      expect(cloud.getTasksFromCloud).toHaveBeenCalled()
      expect(result).toEqual([CLOUD_TASK])
    })

    it("falls back to local when cloud returns empty array", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksFromCloud).mockResolvedValue([])
      vi.mocked(local.getTasks).mockReturnValue([LOCAL_TASK])

      const result = await unified.getTasks()

      expect(local.getTasks).toHaveBeenCalled()
      expect(result).toEqual([LOCAL_TASK])
    })

    it("returns local tasks when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)
      vi.mocked(local.getTasks).mockReturnValue([LOCAL_TASK])

      const result = await unified.getTasks()

      expect(cloud.getTasksFromCloud).not.toHaveBeenCalled()
      expect(result).toEqual([LOCAL_TASK])
    })
  })

  // ── deleteTask ────────────────────────────────────────────────────────────────

  describe("deleteTask", () => {
    it("deletes from cloud and local when authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.deleteTaskFromCloud).mockResolvedValue(true)
      vi.mocked(local.deleteTask).mockReturnValue(true)

      const result = await unified.deleteTask("cloud-1")

      expect(cloud.deleteTaskFromCloud).toHaveBeenCalledWith("cloud-1")
      expect(local.deleteTask).toHaveBeenCalledWith("cloud-1")
      expect(result).toBe(true)
    })

    it("deletes from local only when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)
      vi.mocked(local.deleteTask).mockReturnValue(true)

      const result = await unified.deleteTask("local-1")

      expect(cloud.deleteTaskFromCloud).not.toHaveBeenCalled()
      expect(local.deleteTask).toHaveBeenCalledWith("local-1")
      expect(result).toBe(true)
    })
  })

  // ── getTasksByType ─────────────────────────────────────────────────────────────

  describe("getTasksByType", () => {
    it("returns cloud tasks when authenticated and cloud has data", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksByTypeFromCloud).mockResolvedValue([CLOUD_TASK])

      const result = await unified.getTasksByType("read_aloud")

      expect(cloud.getTasksByTypeFromCloud).toHaveBeenCalledWith("read_aloud")
      expect(result).toEqual([CLOUD_TASK])
    })

    it("falls back to local when cloud returns empty", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksByTypeFromCloud).mockResolvedValue([])
      vi.mocked(local.getTasksByType).mockReturnValue([LOCAL_TASK])

      const result = await unified.getTasksByType("read_aloud")

      expect(local.getTasksByType).toHaveBeenCalledWith("read_aloud")
      expect(result).toEqual([LOCAL_TASK])
    })

    it("returns local tasks when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)
      vi.mocked(local.getTasksByType).mockReturnValue([LOCAL_TASK])

      const result = await unified.getTasksByType("read_aloud")

      expect(cloud.getTasksByTypeFromCloud).not.toHaveBeenCalled()
      expect(result).toEqual([LOCAL_TASK])
    })
  })

  // ── clearAllTasks ────────────────────────────────────────────────────────────

  describe("clearAllTasks", () => {
    it("clears the cloud copy and this device when authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)

      expect(await unified.clearAllTasks()).toBe(true)

      expect(cloud.clearTasksFromCloud).toHaveBeenCalledTimes(1)
      expect(local.clearAllTasks).toHaveBeenCalledTimes(1)
    })

    it("clears this device only when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)

      expect(await unified.clearAllTasks()).toBe(true)

      expect(cloud.clearTasksFromCloud).not.toHaveBeenCalled()
      expect(local.clearAllTasks).toHaveBeenCalledTimes(1)
    })

    it("still clears this device and reports it when the cloud fails", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.clearTasksFromCloud).mockRejectedValueOnce(new Error("offline"))

      expect(await unified.clearAllTasks()).toBe(false)

      expect(local.clearAllTasks).toHaveBeenCalledTimes(1)
    })

    it("does not serve the cleared list from cache", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksFromCloud).mockResolvedValueOnce([CLOUD_TASK])
      expect(await unified.getTasks()).toEqual([CLOUD_TASK])

      await unified.clearAllTasks()
      vi.mocked(cloud.getTasksFromCloud).mockResolvedValueOnce([])
      vi.mocked(local.getTasks).mockReturnValue([])

      expect(await unified.getTasks()).toEqual([])
    })
  })

  describe("getTasksByType under the store policy", () => {
    it("falls back to local when the cloud query fails", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksByTypeFromCloud).mockRejectedValueOnce(new Error("offline"))
      vi.mocked(local.getTasksByType).mockReturnValue([LOCAL_TASK])

      expect(await unified.getTasksByType("read_aloud")).toEqual([LOCAL_TASK])
    })

    it("checks the login once across queries", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTasksByTypeFromCloud).mockResolvedValue([CLOUD_TASK])

      await unified.getTasksByType("read_aloud")
      await unified.getTasksByType("write_essay")

      expect(cloud.isUserLoggedIn).toHaveBeenCalledTimes(1)
    })
  })
})
