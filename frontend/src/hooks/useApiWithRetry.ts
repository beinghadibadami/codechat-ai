/**
 * Custom hook for API calls with automatic retry logic
 */
import { useState, useCallback } from 'react';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  backoffMultiplier: 2, // Exponential backoff
  shouldRetry: (error: any, attempt: number) => {
    // Retry on network errors or 5xx server errors
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      return true;
    }
    if (error.status >= 500 && error.status < 600) {
      return true;
    }
    // Don't retry on 4xx errors (client errors)
    return false;
  }
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const useApiWithRetry = <T = any>(options: RetryOptions = {}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const opts = { ...defaultOptions, ...options };

  /**
   * Execute an API call with retry logic
   */
  const execute = useCallback(async (
    apiCall: () => Promise<T>
  ): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);

    let lastError: any = null;
    let attempt = 0;

    while (attempt <= opts.maxRetries) {
      try {
        const result = await apiCall();
        setIsLoading(false);
        return result;
      } catch (err: any) {
        lastError = err;
        attempt++;
        setRetryCount(attempt);

        // Check if we should retry
        if (attempt <= opts.maxRetries && opts.shouldRetry(err, attempt)) {
          // Calculate delay with exponential backoff
          const delay = opts.retryDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
          console.log(`Retry attempt ${attempt}/${opts.maxRetries} after ${delay}ms`);
          await sleep(delay);
        } else {
          // Don't retry
          break;
        }
      }
    }

    // All retries failed
    setError(lastError);
    setIsLoading(false);
    throw lastError;
  }, [opts.maxRetries, opts.retryDelay, opts.backoffMultiplier]);

  /**
   * Reset error state
   */
  const resetError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  return {
    execute,
    isLoading,
    error,
    retryCount,
    resetError,
  };
};
