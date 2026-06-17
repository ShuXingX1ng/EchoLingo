import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("./task-history", () => ({
  saveTask: vi.fn(),
  getTasks: vi.fn(() => []),
  getTaskById: vi.fn(() => null),
  deleteTask: vi.fn(() => false),
  getTasksByType: vi.fn(() => []),
  clearAllTasks: vi.fn(),
}))

vi.mock("./supabase-task-history", () => ({
  isUserLoggedIn: vi.fn(),
  saveTaskToCloud: vi.fn(),
  getTasksFromCloud: vi.fn(() => []),
  getTaskByIdFromCloud: vi.fn(() => null),
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

  // ── getTaskById ───────────────────────────────────────────────────────────────

  describe("getTaskById", () => {
    it("returns cloud task when found in cloud", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTaskByIdFromCloud).mockResolvedValue(CLOUD_TASK)

      const result = await unified.getTaskById("cloud-1")

      expect(cloud.getTaskByIdFromCloud).toHaveBeenCalledWith("cloud-1")
      expect(result).toEqual(CLOUD_TASK)
    })

    it("falls back to local when not found in cloud", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(true)
      vi.mocked(cloud.getTaskByIdFromCloud).mockResolvedValue(null)
      vi.mocked(local.getTaskById).mockReturnValue(LOCAL_TASK)

      const result = await unified.getTaskById("local-1")

      expect(local.getTaskById).toHaveBeenCalledWith("local-1")
      expect(result).toEqual(LOCAL_TASK)
    })

    it("looks up local only when not authenticated", async () => {
      vi.mocked(cloud.isUserLoggedIn).mockResolvedValue(false)
      vi.mocked(local.getTaskById).mockReturnValue(LOCAL_TASK)

      const result = await unified.getTaskById("local-1")

      expect(cloud.getTaskByIdFromCloud).not.toHaveBeenCalled()
      expect(result).toEqual(LOCAL_TASK)
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
})
