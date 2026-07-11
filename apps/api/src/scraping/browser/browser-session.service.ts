import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import type { BrowserContext, Page } from 'patchright';

/**
 * Keeps one persistent, logged-in Chrome profile per retailer alive for the
 * lifetime of the process, instead of launching a fresh browser per search.
 * Relaunching per-request would both be slow (multi-second Chrome startup)
 * and defeat the point of a persistent profile — bot-detection systems treat
 * a "new" browser fingerprint with no history as suspicious.
 */
@Injectable()
export class BrowserSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserSessionService.name);
  private readonly contexts = new Map<string, Promise<BrowserContext>>();

  constructor(private readonly configService: ConfigService) {}

  async getPage(storeSlug: string): Promise<Page> {
    const context = await this.getContext(storeSlug);
    return context.newPage();
  }

  private getContext(storeSlug: string): Promise<BrowserContext> {
    let context = this.contexts.get(storeSlug);
    if (!context) {
      context = this.launchContext(storeSlug);
      this.contexts.set(storeSlug, context);
    }
    return context;
  }

  private async launchContext(storeSlug: string): Promise<BrowserContext> {
    const { chromium } = await import('patchright');
    const profileRoot = this.configService.get<string>('retailers.browserProfileDir', '.browser-profiles');
    const headless = this.configService.get<boolean>('retailers.browserHeadless', false);
    const profileDir = path.join(profileRoot, storeSlug);

    this.logger.log(`Launching persistent Chrome profile for "${storeSlug}" at ${profileDir} (headless=${headless})`);

    return chromium.launchPersistentContext(profileDir, {
      channel: 'chrome',
      headless,
      viewport: { width: 1366, height: 850 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const [storeSlug, contextPromise] of this.contexts) {
      try {
        const context = await contextPromise;
        await context.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to close browser context for "${storeSlug}": ${message}`);
      }
    }
    this.contexts.clear();
  }
}
