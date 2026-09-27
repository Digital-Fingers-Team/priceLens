/**
 * Caps how many scrape jobs run at once (D-9: 2).
 *
 * Bull v3 adds up the concurrency of every named handler on a queue, so the
 * ingestion queue ran up to 12 jobs at once and nothing stopped them all being
 * scrapes against the same browsers. The queue keeps its layout; the four
 * scrape handlers take a slot here first, and the other jobs are unaffected.
 *
 * Waiters are served by Bull priority (1 = first), then in arrival order, so a
 * shopper's search that arrives behind a pile of background store expansions
 * still gets the next free slot.
 */
export class ScrapeSlots {
  private running = 0;
  private readonly waiting: { priority: number; seq: number; start: () => void }[] = [];
  private seq = 0;

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('ScrapeSlots limit must be a positive integer');
  }

  async run<T>(priority: number, work: () => Promise<T>): Promise<T> {
    await this.acquire(priority);
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  /** Jobs running and jobs waiting for a slot (diagnostics, tests). */
  get stats(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }

  private acquire(priority: number): Promise<void> {
    if (this.running < this.limit) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push({ priority, seq: this.seq++, start: resolve });
      this.waiting.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) {
      // The slot passes straight to the next job; `running` is unchanged.
      next.start();
    } else {
      this.running -= 1;
    }
  }
}
