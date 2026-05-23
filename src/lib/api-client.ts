/**
 * API Client
 *
 * Configurable API client that supports both Next.js API Routes (default)
 * and external Python FastAPI backend.
 *
 * Set NEXT_PUBLIC_API_BASE_URL to use external backend:
 * - Empty or undefined: Use Next.js API Routes (default)
 * - URL like "http://localhost:8000": Use external backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Get the full API URL for a given endpoint.
 */
function getApiUrl(endpoint: string): string {
  // Remove leading slash if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (API_BASE_URL) {
    // External backend (Python FastAPI)
    return `${API_BASE_URL}${cleanEndpoint}`;
  }

  // Next.js API Routes (default)
  return cleanEndpoint;
}

/**
 * Fetch options with common defaults.
 */
const DEFAULT_OPTIONS: RequestInit = {
  headers: {
    "Content-Type": "application/json",
  },
};

/**
 * Make an API request with JSON body.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = getApiUrl(endpoint);

  const response = await fetch(url, {
    ...DEFAULT_OPTIONS,
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || `API error: ${response.status}`);
  }

  return response.json();
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
  });
}

/**
 * POST request with FormData (for file uploads).
 */
export async function apiPostForm<T>(
  endpoint: string,
  formData: FormData,
  options: RequestInit = {}
): Promise<T> {
  const url = getApiUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    // Don't set Content-Type for FormData - browser will set it with boundary
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * POST request that returns a blob (for audio).
 */
export async function apiPostBlob(
  endpoint: string,
  body: unknown,
  options: RequestInit = {}
): Promise<Blob> {
  const url = getApiUrl(endpoint);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.detail || `API error: ${response.status}`);
  }

  return response.blob();
}

/**
 * Check if using external backend.
 */
export function isUsingExternalBackend(): boolean {
  return !!API_BASE_URL;
}

/**
 * Get the current API base URL.
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
