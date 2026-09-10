import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
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
  private loggedBrowserChoice = false;

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

  /**
   * Chrome is preferred (bot-detection systems treat plain Chromium as more
   * suspicious), but the container image falls back to distro Chromium when the
   * Chrome download is unavailable. Requesting `channel: 'chrome'` in that case
   * fails the launch outright, so resolve whatever browser is actually present.
   */
  private resolveBrowserLaunchTarget(): { channel?: string; executablePath?: string } {
    const configured = process.env.BROWSER_EXECUTABLE_PATH;
    if (configured) {
      if (!fs.existsSync(configured)) {
        this.logger.warn(`BROWSER_EXECUTABLE_PATH is set to "${configured}" but no file exists there.`);
      }
      return { executablePath: configured };
    }

    const chromePaths = [
      '/opt/google/chrome/chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
    ];
    if (chromePaths.some((candidate) => fs.existsSync(candidate))) {
      return { channel: 'chrome' };
    }

    const chromiumPaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const chromiumPath = chromiumPaths.find((candidate) => fs.existsSync(candidate));
    if (chromiumPath) {
      // Chromium is the expected browser on arm64, where Google publishes no
      // Linux build — so this is a normal configuration, not a degraded one.
      // Logged once rather than on every store launch.
      if (!this.loggedBrowserChoice) {
        this.loggedBrowserChoice = true;
        this.logger.log(`Using Chromium at ${chromiumPath} (Google Chrome not present)`);
      }
      return { executablePath: chromiumPath };
    }

    // Nothing detected on disk (typical on a developer machine, where Chrome is
    // installed somewhere Playwright resolves itself).
    return { channel: 'chrome' };
  }

  private async launchContext(storeSlug: string): Promise<BrowserContext> {
    const { chromium } = await import('patchright');
    const profileRoot = this.configService.get<string>('retailers.browserProfileDir', '.browser-profiles');
    const headless = this.configService.get<boolean>('retailers.browserHeadless', false);
    const profileDir = path.join(profileRoot, storeSlug);
    const target = this.resolveBrowserLaunchTarget();

    // Chrome's sandbox cannot be used as uid 0, which is how the API container runs.
    const needsNoSandbox = typeof process.getuid === 'function' && process.getuid() === 0;
    const args = needsNoSandbox ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];

    this.logger.log(
      `Launching persistent browser profile for "${storeSlug}" at ${profileDir} ` +
        `(headless=${headless}, browser=${target.executablePath ?? target.channel ?? 'default'})`,
    );

    return chromium.launchPersistentContext(profileDir, {
      ...target,
      args,
      headless,
      viewport: { width: 1366, height: 850 },
    });
  }

  /**
   * Fully closes the persistent Chrome profile for a store, terminating every
   * tab (including the initial `about:blank` page Chrome always spawns) and
   * removing it from the pool so the next fetch launches a fresh browser.
   */
  async closeStore(storeSlug: string): Promise<void> {
    const contextPromise = this.contexts.get(storeSlug);
    if (!contextPromise) return;

    this.contexts.delete(storeSlug);
    try {
      const context = await contextPromise;
      await context.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to close browser context for "${storeSlug}": ${message}`);
    }
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
