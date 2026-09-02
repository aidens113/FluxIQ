import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.FLUXIQ_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const viewportProfiles = [
  { id: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false },
  { id: "short-tablet", viewport: { width: 768, height: 500 }, deviceScaleFactor: 1, hasTouch: false },
  { id: "mobile", viewport: { width: 320, height: 568 }, deviceScaleFactor: 1, hasTouch: true },
  { id: "zoom-200", viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, hasTouch: false },
] as const;
const browserProfiles = [
  { id: "chromium", base: devices["Desktop Chrome"], channel: undefined },
  { id: "edge", base: devices["Desktop Edge"], channel: "msedge" as const },
  { id: "firefox", base: devices["Desktop Firefox"], channel: undefined },
] as const;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: browserProfiles.flatMap((browser) => viewportProfiles.map((profile) => ({
    name: `${profile.id}-${browser.id}`,
    metadata: { browserEngine: browser.id, viewportProfile: profile.id, phase: 8 },
    use: {
      ...browser.base,
      ...(browser.channel ? { channel: browser.channel } : {}),
      viewport: profile.viewport,
      deviceScaleFactor: profile.deviceScaleFactor,
      hasTouch: profile.hasTouch ?? false,
      isMobile: profile.id === "mobile" && browser.id !== "firefox",
    },
  }))),
});
