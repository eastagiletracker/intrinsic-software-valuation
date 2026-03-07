/**
 * Minimal async mutex for serializing concurrent async operations.
 *
 * Uses a promise chain — each `run()` call queues behind the previous
 * one and executes sequentially. No external dependencies.
 */
export class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Execute `fn` while holding the lock. Concurrent callers queue and
   * execute one at a time in arrival order.
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    // Swallow to keep chain alive regardless of rejection.
    this.chain = next.then(
      () => {},
      () => {},
    );
    return next;
  }
}
