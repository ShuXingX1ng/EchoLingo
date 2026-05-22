// API 请求缓存和去重工具

type CacheEntry = {
  data: unknown;
  timestamp: number;
  promise?: Promise<unknown>;
};

const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown>>();

const DEFAULT_CACHE_TTL = 0; // 默认不缓存（对话 API 不应该缓存）

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function clearApiCache(): void {
  cache.clear();
  pendingRequests.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

export async function fetchWithCache<T>(
  url: string,
  options: RequestInit,
  cacheKey?: string,
  cacheTtl: number = DEFAULT_CACHE_TTL
): Promise<T> {
  const key = cacheKey || `${url}-${JSON.stringify(options.body)}`;

  // 检查是否有相同的待处理请求（请求去重）
  const pending = pendingRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  // 检查缓存
  if (cacheTtl > 0) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      return cached.data as T;
    }
  }

  // 发起请求
  const promise = fetch(url, options)
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string }).error || `Request failed: ${response.status}`
        );
      }
      return response.json();
    })
    .then((data) => {
      // 存入缓存
      if (cacheTtl > 0) {
        cache.set(key, { data, timestamp: Date.now() });
      }
      // 清除待处理记录
      pendingRequests.delete(key);
      return data;
    })
    .catch((error) => {
      // 清除待处理记录
      pendingRequests.delete(key);
      throw error;
    });

  // 记录待处理请求
  pendingRequests.set(key, promise);

  // 启动定期清理（如果尚未启动）
  if (typeof window !== "undefined" && !cleanupInterval) {
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > 60000) {
          // 1 分钟后清理
          cache.delete(key);
        }
      }
    }, 30000); // 每 30 秒检查一次
  }

  return promise as Promise<T>;
}
