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
  const password = page.getByLabel("Password");
  if (await password.isVisible()) {
    await password.fill(manifest.credentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByRole("heading", { name: "FluxIQ Workspace" })).toBeVisible();
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
