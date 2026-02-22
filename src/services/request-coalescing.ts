/**
 * Request coalescing - deduplicate concurrent identical requests.
 * When multiple identical requests arrive simultaneously, only one
 * upstream call is made and all callers share the same response.
 */

interface PendingRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export class RequestCoalescer<TKey, TResult> {
  private pending = new Map<string, PendingRequest<TResult>>();
  private windowMs: number;

  constructor(windowMs: number = 100) {
    this.windowMs = windowMs;
  }

  /**
   * Execute a request with coalescing. If an identical request is
   * already in progress, return its promise instead of making a new call.
   */
  async execute(
    key: TKey,
    fn: () => Promise<TResult>
  ): Promise<TResult> {
    const keyStr = this.serializeKey(key);

    // Check for existing pending request
    const existing = this.pending.get(keyStr);
    if (existing && Date.now() - existing.timestamp < this.windowMs) {
      return existing.promise;
    }

    // Create new request
    const promise = fn()
      .finally(() => {
        // Clean up after completion
        this.pending.delete(keyStr);
      });

    this.pending.set(keyStr, {
      promise,
      timestamp: Date.now(),
    });

    return promise;
  }

  /**
   * Get the number of pending requests.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clear all pending requests.
   */
  clear(): void {
    this.pending.clear();
  }

  private serializeKey(key: TKey): string {
    if (typeof key === 'string') {
      return key;
    }
    return JSON.stringify(key);
  }
}

/**
 * Create a coalesced version of an async function.
 */
export function coalesce<TKey, TResult>(
  fn: (key: TKey) => Promise<TResult>,
  windowMs: number = 100
): (key: TKey) => Promise<TResult> {
  const coalescer = new RequestCoalescer<TKey, TResult>(windowMs);
  return (key: TKey) => coalescer.execute(key, () => fn(key));
}
