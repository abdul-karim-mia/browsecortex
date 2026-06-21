import { defineConfig } from '@playwright/test';

/**
 * Integration tests (PLAN §38 Layer 2): real Chrome with the built extension
 * loaded. Run `npm run build` first, then `npm run e2e`. Requires
 * `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: './tests/integration',
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'npx http-server tests/fixtures -p 5179 -s',
    url: 'http://localhost:5179/basic-page.html',
    reuseExistingServer: true,
  },
});
