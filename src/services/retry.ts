export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  factor: number;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = { maxAttempts: 3, initialDelay: 100, maxDelay: 5000, factor: 2 }
): Promise<T> {
  let delay = options.initialDelay;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === options.maxAttempts) {
        throw new Error(
          `Max retry attempts (${options.maxAttempts}) reached. Last error: ${lastError.message}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * options.factor, options.maxDelay);
    }
  }

  throw lastError;
}
