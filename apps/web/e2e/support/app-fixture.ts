import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

export type UiFixtureManifest = {
  schemaVersion: 1;
  credentials: { username: string; password: string };
  fixtureProfiles?: Record<string, Record<string, number>>;
  projects: {
    empty: FixtureProject;
    small: FixtureProject;
    scale1k: FixtureProject;
    scale10k: FixtureProject;
    representative: FixtureProject;
    scale: FixtureProject;
  };
};

type FixtureProject = {
  id: string;
  name: string;
  flowIds?: string[];
  counts?: Record<string, number>;
};

const webRoot = path.resolve(import.meta.dirname, "../..");

export async function readUiFixtureManifest(): Promise<UiFixtureManifest> {
  const fixtureRoot = path.resolve(process.env.FLUXIQ_E2E_FIXTURE_ROOT ?? path.join(webRoot, ".e2e-host"));
  return JSON.parse(await readFile(path.join(fixtureRoot, "fixture-manifest.json"), "utf8")) as UiFixtureManifest;
}

export async function authenticate(page: Page, manifest: UiFixtureManifest): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const username = page.locator('input[name="username"]');
  const password = page.locator("#auth-password");
  if (await password.isVisible()) {
    const usernameValue = process.env.FLUXIQ_E2E_USERNAME ?? manifest.credentials.username;
    const passwordValue = process.env.FLUXIQ_E2E_PASSWORD ?? manifest.credentials.password;
    const submit = page.getByRole("button", { name: "Sign in" });
    await expect(username).toBeEditable();
    await expect(password).toBeEditable();
    for (let attempt = 0; attempt < 3 && !await submit.isEnabled(); attempt += 1) {
      await username.fill(usernameValue);
      await password.fill(passwordValue);
      await page.waitForTimeout(50);
    }
    await expect(username).toHaveValue(usernameValue);
    await expect(password).toHaveValue(passwordValue);
    await expect(submit).toBeEnabled();
    await submit.click();
  }
  await expect(page.getByRole("heading", { name: "Programs", exact: true })).toBeVisible();
}

export async function captureState(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    animations: "disabled",
    fullPage: true,
  });
}

export async function openFixtureProject(page: Page, project: FixtureProject): Promise<void> {
  await page.goto(`/programs/automation-studio?project=${encodeURIComponent(project.id)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator(".automation-studio-sidebar-heading").getByText(project.name)).toBeVisible();
}
