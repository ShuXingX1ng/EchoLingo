/**
 * API Client
 *
 * Direct client for the FastAPI backend. NEXT_PUBLIC_API_BASE_URL must be set
 * (e.g. "http://localhost:8000" in development, production URL in prod).
 * Throws at call-time if the env var is missing so misconfiguration is caught
 * immediately rather than silently falling back.
 *
 * See ADR 0007 for the frontend–backend separation rationale.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private nextAttemptTime: number = 0;
  
  private readonly failureThreshold = 3;
  private readonly resetTimeoutMs = 30000;

  public checkState(): void {
    if (this.state === "OPEN") {
      if (Date.now() > this.nextAttemptTime) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("服务当前不可用，已暂停请求，请稍后重试。(Circuit Breaker Open)");
      }
    }
  }

  public recordSuccess(): void {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  public recordFailure(): void {
    this.failureCount += 1;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
    }
  }
  
  // For testing purposes
  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }
}

export const circuitBreaker = new CircuitBreaker();

/**
 * Get the full API URL for a given endpoint.
 * Throws if NEXT_PUBLIC_API_BASE_URL is not configured.
 */
function getApiUrl(endpoint: string): string {
  if (!API_BASE_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. " +
      "Please configure it to point to the FastAPI backend (e.g. http://localhost:8000)."
    )
  }
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`
  return `${API_BASE_URL}${cleanEndpoint}`
}

function handleFetchError(err: unknown) {
  if (err instanceof Error) {
    if (err.message.includes("Circuit Breaker Open")) {
      throw err;
    }
    if (err.name === "AbortError" || err.message?.includes("timed out")) {
      circuitBreaker.recordFailure();
      throw new Error("请求超时，请检查网络后重试。(Request timed out)")
    }
    if (err.message === "Failed to fetch" || err.message?.includes("NetworkError")) {
      circuitBreaker.recordFailure();
      throw new Error("无法连接到服务器，请确保网络正常或稍后再试。(Unable to connect to backend)")
    }
  }
  throw err;
}

/**
 * Make an API request with common error handling.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  circuitBreaker.checkState();
  const url = getApiUrl(endpoint)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status >= 500 && response.status <= 504) {
        circuitBreaker.recordFailure();
        throw new Error("后端服务暂时不可用，请稍后再试。(Backend services temporarily unavailable)")
      }
      circuitBreaker.recordSuccess();
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || error.detail || `API error: ${response.status}`)
    }

    circuitBreaker.recordSuccess();
    return response.json()
  } catch (err: unknown) {
    handleFetchError(err);
    throw err;
  }
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(
  endpoint: string,
  body: unknown,
  options: RequestInit = {}
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  })
}

/**
 * POST request with FormData (for file uploads).
 * Do NOT set Content-Type manually — the browser sets it with the multipart boundary.
 */
export async function apiPostForm<T>(
  endpoint: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<T> {
  circuitBreaker.checkState();
  const url = getApiUrl(endpoint)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status >= 500 && response.status <= 504) {
        circuitBreaker.recordFailure();
        throw new Error("后端服务暂时不可用，请稍后再试。(Backend services temporarily unavailable)")
      }
      circuitBreaker.recordSuccess();
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || error.detail || `API error: ${response.status}`)
    }

    circuitBreaker.recordSuccess();
    return response.json()
  } catch (err: unknown) {
    handleFetchError(err);
    throw err;
  }
}

/**
 * POST request that returns a blob (for audio).
 */
export async function apiPostBlob(
  endpoint: string,
  body: unknown,
  options: RequestInit = {}
): Promise<Blob> {
  circuitBreaker.checkState();
  const url = getApiUrl(endpoint)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      ...options,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status >= 500 && response.status <= 504) {
        circuitBreaker.recordFailure();
        throw new Error("后端服务暂时不可用，请稍后再试。(Backend services temporarily unavailable)")
      }
      circuitBreaker.recordSuccess();
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || error.detail || `API error: ${response.status}`)
    }

    circuitBreaker.recordSuccess();
    return response.blob()
  } catch (err: unknown) {
    handleFetchError(err);
    throw err;
  }
}
