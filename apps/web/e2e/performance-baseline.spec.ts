import { expect, test } from "@playwright/test";
import {
  authenticate,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";
import {
  collectUiPerformance,
  installUiPerformanceCollection,
  measureInteraction,
  writeUiPerformanceArtifact,
} from "./support/performance";
import { evaluateStudioScenarioBudgets, formatUiPerformanceViolations } from "../src/features/programs/ui-performance-budgets";

test("records scale-project navigation, payload, long-task, and render metrics", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await installUiPerformanceCollection(page);

  const interactions: Record<string, number> = {};
  interactions.openScaleProject = await measureInteraction(page, async () => {
    await openFixtureProject(page, manifest.projects.scale);
  });

  const firstFlow = page.locator(".tree-row-main").filter({ hasText: "Large Adaptive Flow 0" }).first();
  interactions.selectFirstFlow = await measureInteraction(page, async () => {
    await firstFlow.click();
    await expect(page.getByText("Router", { exact: true }).first()).toBeVisible();
  });

  const runtimeDebug = page.locator(".tree-row-main").filter({ hasText: "Runtime Debug" }).first();
  interactions.openRuntimeDebug = await measureInteraction(page, async () => {
    await runtimeDebug.click();
    await expect(page.getByText("Runtime Debug", { exact: true }).first()).toBeVisible();
  });

  await page.waitForTimeout(250);
  const snapshot = await collectUiPerformance(page, interactions);
  expect(snapshot.domNodes).toBeGreaterThan(0);
  expect(snapshot.apiMetrics.length).toBeGreaterThan(0);
  expect(snapshot.renderMetrics.length).toBeGreaterThan(0);
  await writeUiPerformanceArtifact(testInfo, "studio-scale-performance", snapshot);
  const violations = evaluateStudioScenarioBudgets(snapshot);
  expect(violations, formatUiPerformanceViolations(violations)).toEqual([]);
});

test("records global program navigation and payload metrics", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await installUiPerformanceCollection(page);

  const interactions: Record<string, number> = {};
  for (const programId of ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"]) {
    interactions[`open-${programId}`] = await measureInteraction(page, async () => {
      await page.goto(`/programs/${programId}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
    });
  }

  await page.waitForTimeout(250);
  const snapshot = await collectUiPerformance(page, interactions);
  expect(snapshot.domNodes).toBeGreaterThan(0);
  await writeUiPerformanceArtifact(testInfo, "global-program-performance", snapshot);
});
