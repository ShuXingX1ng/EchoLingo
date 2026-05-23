import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

async function importWithBaseUrl(baseUrl: string | undefined) {
  if (baseUrl !== undefined) {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", baseUrl);
  } else {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  }
  vi.resetModules();
  return import("./api-client");
}

describe("api-client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("base URL configuration", () => {
    it("getApiBaseUrl returns empty string when no external backend", async () => {
      const { getApiBaseUrl } = await importWithBaseUrl(undefined);
      expect(getApiBaseUrl()).toBe("");
    });

    it("isUsingExternalBackend returns false when base URL is empty", async () => {
      const { isUsingExternalBackend } = await importWithBaseUrl(undefined);
      expect(isUsingExternalBackend()).toBe(false);
    });

    it("isUsingExternalBackend returns true when base URL is set", async () => {
      const { isUsingExternalBackend } = await importWithBaseUrl("http://localhost:8000");
      expect(isUsingExternalBackend()).toBe(true);
    });

    it("getApiBaseUrl returns the configured URL", async () => {
      const { getApiBaseUrl } = await importWithBaseUrl("http://localhost:8000");
      expect(getApiBaseUrl()).toBe("http://localhost:8000");
    });

    it("apiRequest prepends base URL to endpoint", async () => {
      const { apiRequest } = await importWithBaseUrl("http://localhost:8000");
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await apiRequest("/api/test");
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/api/test", expect.any(Object));
    });
  });

  describe("apiRequest", () => {
    it("calls fetch with correct URL and default headers", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await apiRequest("/api/test");
      expect(mockFetch).toHaveBeenCalledWith("/api/test", { headers: { "Content-Type": "application/json" } });
    });

    it("returns parsed JSON on success", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      const payload = { message: "hello", data: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
      const result = await apiRequest<typeof payload>("/api/test");
      expect(result).toEqual(payload);
    });

    it("throws error with server error.message on non-OK response", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404, statusText: "Not Found" })
      );
      await expect(apiRequest("/api/missing")).rejects.toThrow("Not found");
    });

    it("throws error with server error.detail when error field is absent", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Bad request" }), { status: 400 }));
      await expect(apiRequest("/api/bad")).rejects.toThrow("Bad request");
    });

    it("throws generic status error when response body is not JSON", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));
      await expect(apiRequest("/api/fail")).rejects.toThrow("API error: 500");
    });

    it("merges caller options with defaults", async () => {
      const { apiRequest } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
      await apiRequest("/api/test", { method: "PUT", headers: { Authorization: "Bearer token" } });
      expect(mockFetch).toHaveBeenCalledWith("/api/test", { headers: { Authorization: "Bearer token" }, method: "PUT" });
    });
  });

  describe("apiPost", () => {
    it("sends POST request with JSON-stringified body", async () => {
      const { apiPost } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "123" }), { status: 200 }));
      const result = await apiPost("/api/sessions", { name: "test" });
      expect(mockFetch).toHaveBeenCalledWith("/api/sessions", expect.objectContaining({
        method: "POST", body: JSON.stringify({ name: "test" }),
      }));
      expect(result).toEqual({ id: "123" });
    });

    it("propagates errors from apiRequest", async () => {
      const { apiPost } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Validation failed" }), { status: 422 })
      );
      await expect(apiPost("/api/sessions", {})).rejects.toThrow("Validation failed");
    });
  });

  describe("apiPostForm", () => {
    it("sends FormData without Content-Type header", async () => {
      const { apiPostForm } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ uploaded: true }), { status: 200 }));
      const formData = new FormData();
      formData.append("file", new Blob(["audio"], { type: "audio/wav" }));
      const result = await apiPostForm("/api/upload", formData);
      const [, fetchOptions] = mockFetch.mock.calls[0];
      expect(fetchOptions.body).toBe(formData);
      expect(fetchOptions.method).toBe("POST");
      expect(fetchOptions.headers).toBeUndefined();
      expect(result).toEqual({ uploaded: true });
    });

    it("throws on non-OK form upload response", async () => {
      const { apiPostForm } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "File too large" }), { status: 413 })
      );
      const formData = new FormData();
      await expect(apiPostForm("/api/upload", formData)).rejects.toThrow("File too large");
    });
  });

  describe("apiPostBlob", () => {
    it("returns a Blob on success", async () => {
      const { apiPostBlob } = await importWithBaseUrl(undefined);
      const audioContent = new Uint8Array([1, 2, 3, 4]);
      mockFetch.mockResolvedValueOnce(new Response(audioContent, { status: 200, headers: { "Content-Type": "audio/wav" } }));
      const blob = await apiPostBlob("/api/tts", { text: "hello" });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledWith("/api/tts", expect.objectContaining({
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "hello" }),
      }));
    });

    it("throws on non-OK blob response", async () => {
      const { apiPostBlob } = await importWithBaseUrl(undefined);
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "TTS failed" }), { status: 502 })
      );
      await expect(apiPostBlob("/api/tts", { text: "hi" })).rejects.toThrow("TTS failed");
    });
  });
});
