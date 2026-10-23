// Configuração dos testes de ponta a ponta (Playwright).
// Sobe o site numa porta local e roda os testes no Chromium.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  webServer: {
    command: "node tests/e2e/servidor.js",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
