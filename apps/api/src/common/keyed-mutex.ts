/**
 * Runs async work one at a time per key, in arrival order; different keys
 * run concurrently. In-process only: it serializes work inside one Node
 * process, which is where all ingestion runs today (ADR 0004). A second
 * worker process would need a database lock instead (audit 02, L-19).
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => done);
    this.tails.set(key, tail);

    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Keys with work running or waiting (for tests and diagnostics). */
  get size(): number {
    return this.tails.size;
  }
}
