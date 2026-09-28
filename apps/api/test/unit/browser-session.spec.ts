import type { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { BrowserSessionService } from '../../src/scraping/browser/browser-session.service';

const launchPersistentContext = jest.fn();
jest.mock('patchright', () => ({ chromium: { launchPersistentContext } }));

function config(): ConfigService {
  const values: Record<string, unknown> = {
    'retailers.browserProfileDir': '/tmp/pricelens-browser-session-spec',
    'retailers.browserHeadless': true,
  };
  return { get: (key: string, fallback: unknown) => (key in values ? values[key] : fallback) } as ConfigService;
}

function fakePage() {
  const page = new EventEmitter() as EventEmitter & { close: jest.Mock };
  page.close = jest.fn(async () => {
    page.emit('close');
  });
  return page;
}

function fakeContext() {
  const context = new EventEmitter() as EventEmitter & Record<string, jest.Mock>;
  const page = fakePage();
  context.pages = jest.fn().mockReturnValue([]);
  context.newPage = jest.fn().mockResolvedValue(page);
  context.close = jest.fn().mockResolvedValue(undefined);
  return { context, page };
}

describe('BrowserSessionService', () => {
  const realNow = Date.now;
  let now: number;

  beforeEach(() => {
    launchPersistentContext.mockReset();
    now = 1_000_000;
    Date.now = () => now;
    process.env.BROWSER_EXECUTABLE_PATH = '/nonexistent/chrome';
  });

  afterEach(() => {
    Date.now = realNow;
    delete process.env.BROWSER_EXECUTABLE_PATH;
  });

  it('launches with service workers blocked (they leaked driver memory per page)', async () => {
    const { context, page } = fakeContext();
    launchPersistentContext.mockResolvedValue(context);
    const service = new BrowserSessionService(config());

    await expect(service.getPage('noon')).resolves.toBe(page);

    expect(launchPersistentContext).toHaveBeenCalledTimes(1);
    expect(launchPersistentContext.mock.calls[0][1]).toMatchObject({ serviceWorkers: 'block' });
  });

  it('waits a minute after a failed launch instead of relaunching on every search', async () => {
    launchPersistentContext.mockRejectedValue(new Error('Missing X server or $DISPLAY'));
    const service = new BrowserSessionService(config());

    await expect(service.getPage('noon')).rejects.toThrow(/failed to launch recently/);
    await expect(service.getPage('noon')).rejects.toThrow(/next attempt in 60s/);
    expect(launchPersistentContext).toHaveBeenCalledTimes(1);

    // Other stores are unaffected.
    await expect(service.getPage('jumia')).rejects.toThrow(/failed to launch recently/);
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);

    // After the pause, the next search tries again and a success clears the pause.
    const { context, page } = fakeContext();
    launchPersistentContext.mockResolvedValue(context);
    now += BrowserSessionService.LAUNCH_RETRY_MS;
    await expect(service.getPage('noon')).resolves.toBe(page);
    expect(launchPersistentContext).toHaveBeenCalledTimes(3);
  });

  it('still relaunches once when a cached browser has died', async () => {
    const first = fakeContext();
    first.context.newPage.mockRejectedValue(new Error('Target page, context or browser has been closed'));
    const second = fakeContext();
    launchPersistentContext.mockResolvedValueOnce(first.context).mockResolvedValueOnce(second.context);
    const service = new BrowserSessionService(config());

    await expect(service.getPage('noon')).resolves.toBe(second.page);
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });

  it('recycles a store browser after MAX_PAGES_PER_BROWSER pages, once none are open (OPS-01)', async () => {
    const first = fakeContext();
    first.context.newPage.mockImplementation(async () => fakePage());
    const second = fakeContext();
    launchPersistentContext.mockResolvedValueOnce(first.context).mockResolvedValueOnce(second.context);
    const service = new BrowserSessionService(config());
    const max = BrowserSessionService.MAX_PAGES_PER_BROWSER;

    // One page stays open while the limit is reached: nothing is closed under it.
    const held = await service.getPage('noon');
    for (let i = 1; i < max; i++) await (await service.getPage('noon')).close();
    await Promise.resolve();
    expect(first.context.close).not.toHaveBeenCalled();

    // The last open page closes: the browser goes, and its driver state with it.
    await held.close();
    await new Promise((resolve) => setImmediate(resolve));
    expect(first.context.close).toHaveBeenCalledTimes(1);

    // The next search launches a fresh one; other stores are not affected.
    await expect(service.getPage('noon')).resolves.toBe(second.page);
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });
});
