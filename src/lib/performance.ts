// 性能监控工具

export function measurePerformance(name: string, fn: () => Promise<unknown>) {
  return async <T>(...args: unknown[]): Promise<T> => {
    const start = performance.now();
    try {
      const result = await fn(...args);
      const duration = performance.now() - start;
      logMetric(name, duration);
      return result as T;
    } catch (error) {
      const duration = performance.now() - start;
      logMetric(`${name} (failed)`, duration);
      throw error;
    }
  };
}

export function logMetric(name: string, duration: number) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);
  }
}

// 测量 API 请求时间
export async function measureApiCall<T>(
  name: string,
  apiCall: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await apiCall();
    const duration = performance.now() - start;
    logMetric(`API: ${name}`, duration);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logMetric(`API: ${name} (error)`, duration);
    throw error;
  }
}

// Web Vitals 监控（仅开发环境）
export function initWebVitals() {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") {
    return;
  }

  // 监控 LCP (Largest Contentful Paint)
  if ("PerformanceObserver" in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          logMetric("LCP", lastEntry.startTime);
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

      // 监控 FID (First Input Delay)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if ("processingStart" in entry) {
            logMetric("FID", (entry as PerformanceEventTiming).processingStart - entry.startTime);
          }
        });
      });
      fidObserver.observe({ type: "first-input", buffered: true });

      // 监控 CLS (Cumulative Layout Shift)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if ("hadRecentInput" in entry && !(entry as LayoutShift).hadRecentInput) {
            clsValue += (entry as LayoutShift).value;
          }
        });
        logMetric("CLS", clsValue);
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // PerformanceObserver not fully supported
    }
  }
}

// 类型声明
interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}
