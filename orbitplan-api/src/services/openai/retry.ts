const RETRYABLE_ERROR_PATTERNS = [
  "connection error",
  "network",
  "fetch failed",
  "socket hang up",
  "econnreset",
  "enotfound",
  "etimedout",
  "eai_again",
  "api connection",
];

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const withOpenAiRetry = async <T>(operation: () => Promise<T>, retries = 2): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const shouldRetry = RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
      if (!shouldRetry || attempt === retries) break;
      await wait(500 * 2 ** attempt);
      attempt += 1;
    }
  }

  throw lastError;
};
