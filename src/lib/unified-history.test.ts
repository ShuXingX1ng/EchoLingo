import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock modules before importing unified-history
vi.mock("./history", () => ({
  saveSession: vi.fn(),
  getSessions: vi.fn(() => []),
  getSessionById: vi.fn(),
  deleteSession: vi.fn(),
  clearAllSessions: vi.fn(),
  getStorageUsage: vi.fn(() => ({ used: 0, total: 5 * 1024 * 1024 })),
}));

vi.mock("./supabase-history", () => ({
  isUserLoggedIn: vi.fn(),
  saveSessionToCloud: vi.fn(),
  getSessionsFromCloud: vi.fn(() => []),
  getSessionByIdFromCloud: vi.fn(),
  deleteSessionFromCloud: vi.fn(),
  clearAllSessionsFromCloud: vi.fn(),
  migrateLocalSessionsToCloud: vi.fn(() => ({ success: 0, failed: 0 })),
}));

import * as unifiedHistory from "./unified-history";
import * as localHistory from "./history";
import * as cloudHistory from "./supabase-history";

const mockMessages = [
  { id: "1", role: "user" as const, content: "Hello", createdAt: "2024-01-01T00:00:00Z" },
  { id: "2", role: "examiner" as const, content: "Hi there!", createdAt: "2024-01-01T00:00:01Z" },
];

const mockFeedback = {
  estimatedBand: 6.5,
  fluencyAndCoherence: "Good fluency",
  lexicalResource: "Adequate vocabulary",
  grammarRangeAndAccuracy: "Mix of structures",
  pronunciation: "Clear pronunciation",
  strengths: ["Good examples"],
  weaknesses: ["Limited vocabulary"],
  improvementSuggestions: ["Practice more"],
  improvedSampleAnswer: "Better answer here",
};

const mockLocalSession = {
  id: "local-123",
  mode: "ielts_part_1",
  messages: mockMessages,
  feedback: mockFeedback,
  createdAt: "2024-01-01T00:00:00Z",
  endedAt: "2024-01-01T00:05:00Z",
};

const mockCloudSession = {
  id: "cloud-456",
  mode: "ielts_part_1",
  messages: mockMessages,
  feedback: mockFeedback,
  createdAt: "2024-01-01T00:00:00Z",
  endedAt: "2024-01-01T00:05:00Z",
};

describe("unified-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveSession", () => {
    it("saves to cloud when user is authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.saveSessionToCloud).mockResolvedValue(mockCloudSession);

      const result = await unifiedHistory.saveSession(mockMessages, mockFeedback, "ielts_part_1");

      expect(cloudHistory.saveSessionToCloud).toHaveBeenCalledWith(mockMessages, mockFeedback, "ielts_part_1");
      expect(localHistory.saveSession).toHaveBeenCalledWith(mockMessages, mockFeedback, "ielts_part_1");
      expect(result).toEqual(mockCloudSession);
    });

    it("falls back to local when cloud save returns null", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.saveSessionToCloud).mockResolvedValue(null);
      vi.mocked(localHistory.saveSession).mockReturnValue(mockLocalSession);

      const result = await unifiedHistory.saveSession(mockMessages, mockFeedback, "ielts_part_1");

      expect(localHistory.saveSession).toHaveBeenCalledWith(mockMessages, mockFeedback, "ielts_part_1");
      expect(result).toEqual(mockLocalSession);
    });

    it("saves to local when user is not authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(false);
      vi.mocked(localHistory.saveSession).mockReturnValue(mockLocalSession);

      const result = await unifiedHistory.saveSession(mockMessages, mockFeedback, "ielts_part_1");

      expect(cloudHistory.saveSessionToCloud).not.toHaveBeenCalled();
      expect(localHistory.saveSession).toHaveBeenCalledWith(mockMessages, mockFeedback, "ielts_part_1");
      expect(result).toEqual(mockLocalSession);
    });

    it("falls back to local when cloud save fails", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.saveSessionToCloud).mockRejectedValue(new Error("Network error"));
      vi.mocked(localHistory.saveSession).mockReturnValue(mockLocalSession);

      const result = await unifiedHistory.saveSession(mockMessages, mockFeedback, "ielts_part_1");

      expect(result).toEqual(mockLocalSession);
    });
  });

  describe("getSessions", () => {
    it("returns cloud sessions when user is authenticated and cloud has data", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.getSessionsFromCloud).mockResolvedValue([mockCloudSession]);

      const result = await unifiedHistory.getSessions();

      expect(cloudHistory.getSessionsFromCloud).toHaveBeenCalled();
      expect(result).toEqual([mockCloudSession]);
    });

    it("falls back to local when cloud returns empty", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.getSessionsFromCloud).mockResolvedValue([]);
      vi.mocked(localHistory.getSessions).mockReturnValue([mockLocalSession]);

      const result = await unifiedHistory.getSessions();

      expect(localHistory.getSessions).toHaveBeenCalled();
      expect(result).toEqual([mockLocalSession]);
    });

    it("returns local sessions when user is not authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(false);
      vi.mocked(localHistory.getSessions).mockReturnValue([mockLocalSession]);

      const result = await unifiedHistory.getSessions();

      expect(cloudHistory.getSessionsFromCloud).not.toHaveBeenCalled();
      expect(result).toEqual([mockLocalSession]);
    });
  });

  describe("getSessionById", () => {
    it("returns cloud session when found", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.getSessionByIdFromCloud).mockResolvedValue(mockCloudSession);

      const result = await unifiedHistory.getSessionById("cloud-456");

      expect(result).toEqual(mockCloudSession);
    });

    it("falls back to local when not found in cloud", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.getSessionByIdFromCloud).mockResolvedValue(null);
      vi.mocked(localHistory.getSessionById).mockReturnValue(mockLocalSession);

      const result = await unifiedHistory.getSessionById("local-123");

      expect(localHistory.getSessionById).toHaveBeenCalledWith("local-123");
      expect(result).toEqual(mockLocalSession);
    });
  });

  describe("deleteSession", () => {
    it("deletes from cloud and local when authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.deleteSessionFromCloud).mockResolvedValue(true);

      const result = await unifiedHistory.deleteSession("session-123");

      expect(cloudHistory.deleteSessionFromCloud).toHaveBeenCalledWith("session-123");
      expect(localHistory.deleteSession).toHaveBeenCalledWith("session-123");
      expect(result).toBe(true);
    });

    it("deletes from local only when not authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(false);
      vi.mocked(localHistory.deleteSession).mockReturnValue(true);

      const result = await unifiedHistory.deleteSession("session-123");

      expect(cloudHistory.deleteSessionFromCloud).not.toHaveBeenCalled();
      expect(localHistory.deleteSession).toHaveBeenCalledWith("session-123");
      expect(result).toBe(true);
    });
  });

  describe("clearAllSessions", () => {
    it("clears cloud and local when authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(true);
      vi.mocked(cloudHistory.clearAllSessionsFromCloud).mockResolvedValue(true);

      const result = await unifiedHistory.clearAllSessions();

      expect(cloudHistory.clearAllSessionsFromCloud).toHaveBeenCalled();
      expect(localHistory.clearAllSessions).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it("clears local only when not authenticated", async () => {
      vi.mocked(cloudHistory.isUserLoggedIn).mockResolvedValue(false);

      const result = await unifiedHistory.clearAllSessions();

      expect(cloudHistory.clearAllSessionsFromCloud).not.toHaveBeenCalled();
      expect(localHistory.clearAllSessions).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe("migrateLocalToCloud", () => {
    it("migrates local sessions to cloud", async () => {
      vi.mocked(localHistory.getSessions).mockReturnValue([mockLocalSession]);
      vi.mocked(cloudHistory.migrateLocalSessionsToCloud).mockResolvedValue({ success: 1, failed: 0 });

      const result = await unifiedHistory.migrateLocalToCloud();

      expect(cloudHistory.migrateLocalSessionsToCloud).toHaveBeenCalledWith([mockLocalSession]);
      expect(result).toEqual({ success: 1, failed: 0, total: 1 });
    });

    it("returns zeros when no local sessions", async () => {
      vi.mocked(localHistory.getSessions).mockReturnValue([]);

      const result = await unifiedHistory.migrateLocalToCloud();

      expect(result).toEqual({ success: 0, failed: 0, total: 0 });
    });
  });

  describe("getStorageUsage", () => {
    it("returns local storage usage", () => {
      vi.mocked(localHistory.getStorageUsage).mockReturnValue({ used: 1024, total: 5 * 1024 * 1024 });

      const result = unifiedHistory.getStorageUsage();

      expect(result).toEqual({ used: 1024, total: 5 * 1024 * 1024 });
    });
  });
});
