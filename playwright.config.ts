import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/** Online tests need vuess-server; by default it is expected next to this project. */
const serverDir = resolve(process.env.VUESS_SERVER_DIR ?? '../vuess-server')
export const hasOnlineServer = existsSync(resolve(serverDir, 'package.json'))

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm build && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    ...(hasOnlineServer
      ? [
          {
            command: `pnpm --dir "${serverDir}" build && node "${resolve(serverDir, 'dist/index.js')}"`,
            url: 'http://localhost:4310/health',
            env: { PORT: '4310', CORS_ORIGINS: 'http://localhost:4173' },
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]
      : []),
  ],
})
