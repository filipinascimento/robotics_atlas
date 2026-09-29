import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4175/robotics_atlas/",
    viewport: { width: 1440, height: 960 },
    launchOptions: { args: ["--no-sandbox", "--enable-unsafe-swiftshader"] },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4175 --strictPort --base /robotics_atlas/",
    url: "http://127.0.0.1:4175/robotics_atlas/",
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
