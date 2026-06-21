import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Integration smoke test (PLAN §38 Layer 2). Loads the built extension into a
 * real Chrome and exercises a fixture page. Run `npm run build` first.
 *
 * The AI provider would be mocked with MSW for full agent-loop tests; this
 * smoke test covers extension loading + content injection without a provider.
 */
const distPath = path.resolve(fileURLToPath(new URL('../../dist', import.meta.url)));

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  });
});

test.afterAll(async () => {
  await context?.close();
});

test('extension loads a background service worker', async () => {
  // The MV3 service worker registers shortly after the context starts.
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  expect(worker.url()).toContain('background');
});

test('a fixture page renders its content', async () => {
  const page = await context.newPage();
  await page.goto('http://localhost:5179/basic-page.html');
  await expect(page.locator('h1')).toHaveText('Welcome to the test page');
  await page.close();
});
