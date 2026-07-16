// lib/requestManager.ts
// Production-grade request manager with retry, rate limiting, and timeout handling

interface RequestConfig {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  backoffMultiplier?: number;
}

const DEFAULT_CONFIG: Required<RequestConfig> = {
  maxRetries: 3,
  retryDelay: 500,
  timeout: 10000,
  backoffMultiplier: 2,
};

class RequestManager {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestsPerSecond = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_SECOND || '10');
  private lastRequestTime = 0;

  async executeWithRetry<T>(
    url: string,
    options: RequestInit = {},
    config: RequestConfig = {}
  ): Promise<T> {
    const { maxRetries, retryDelay, timeout, backoffMultiplier } = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeWithTimeout(url, options, timeout);

        // Success
        if (response.ok) {
          return await response.json();
        }

        // Don't retry on 4xx errors (client fault)
        if (response.status >= 400 && response.status < 500) {
          const data = await response.json().catch(() => ({}));
          const error = new Error(
            `API Error ${response.status}: ${data.retMsg || response.statusText}`
          );
          throw error;
        }

        // Retry on 5xx errors and network issues
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

        if (attempt < maxRetries) {
          const backoffMs = retryDelay * Math.pow(backoffMultiplier, attempt);
          await this.delay(backoffMs);
          continue;
        }

        throw lastError;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw lastError;
        }

        const backoffMs = retryDelay * Math.pow(backoffMultiplier, attempt);
        await this.delay(backoffMs);
      }
    }

    throw lastError || new Error('Request failed');
  }

  async executeWithRateLimit<T>(
    url: string,
    options: RequestInit = {},
    config: RequestConfig = {}
  ): Promise<T> {
    // Wait for rate limit slot
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minIntervalMs = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minIntervalMs) {
      await this.delay(minIntervalMs - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    return this.executeWithRetry(url, options, config);
  }

  private async executeWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const requestManager = new RequestManager();

// Helper function for easy usage
export async function fetchAPI<T>(
  url: string,
  options?: RequestInit,
  config?: RequestConfig
): Promise<T> {
  return requestManager.executeWithRateLimit(url, options, config);
}
