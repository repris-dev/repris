import type { PlaywrightTestConfig } from '@playwright/test';
import { devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  webServer: {
    command: 'pnpm start',
    port: 3000,
    reuseExistingServer: true,
  },
  testDir: './.tsc',
  snapshotDir: './.playwright/snapshots',
  outputDir: './.playwright/test-results',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
};

export default config;
