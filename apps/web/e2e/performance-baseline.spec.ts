import { expect, test } from "@playwright/test";
import {
  authenticate,
  openFixtureProject,
  readUiFixtureManifest,
} from "./support/app-fixture";
import {
  collectUiPerformance,
  collectBrowserHeapUsage,
  formatStudioSettledInteraction,
  installUiPerformanceCollection,
  measureInteraction,
  type StudioSettledInteractionMetrics,
  writeUiPerformanceArtifact,
} from "./support/performance";
import { UI_PERFORMANCE_BUDGETS, evaluateStudioScenarioBudgets, formatUiPerformanceViolations } from "../src/features/programs/ui-performance-budgets";

test("records scale-project navigation, payload, long-task, and render metrics", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await installUiPerformanceCollection(page);

  const interactions: Record<string, number> = {};
  const interactionMetrics: Record<string, StudioSettledInteractionMetrics> = {};
  async function recordInteraction(name: string, operation: () => Promise<void>): Promise<void> {
    const metrics = await measureInteraction(page, operation, { returnMetrics: true });
    interactions[name] = metrics.duration;
    interactionMetrics[name] = metrics;
    testInfo.annotations.push({ type: `studio:${name}`, description: formatStudioSettledInteraction(metrics) });
  }

  await recordInteraction("projectOpen", async () => {
    await openFixtureProject(page, manifest.projects.scale);
  });

  const firstFlow = page.locator(".tree-row-main").filter({ hasText: "Large Adaptive Flow 0" }).first();
  await recordInteraction("viewSwitch.flow", async () => {
    await firstFlow.click();
    await expect(page.getByText("Router", { exact: true }).first()).toBeVisible();
  });

  const nodesView = page.locator(".tree-row-main").filter({ hasText: "Nodes" }).first();
  await recordInteraction("viewSwitch.nodes", async () => {
    await nodesView.click();
    await expect(page.locator(".react-flow").first()).toBeVisible();
  });
  const firstGraphNode = page.locator(".react-flow__node").first();
  if (await firstGraphNode.count()) {
    await recordInteraction("graphSelect.firstNode", async () => {
      await firstGraphNode.click();
    });
    const box = await firstGraphNode.boundingBox();
    if (box) {
      await recordInteraction("graphDrag.firstNode", async () => {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2 + 20, { steps: 4 });
        await page.mouse.up();
      });
    }
  }

  const runtimeDebug = page.locator(".tree-row-main").filter({ hasText: "Runtime Debug" }).first();
  await recordInteraction("runtimeDebugOpen", async () => {
    await runtimeDebug.click();
    await expect(page.getByText("Runtime Debug", { exact: true }).first()).toBeVisible();
  });
  const firstRun = page.locator(".automation-runtime-run-row").first();
  if (await firstRun.count()) {
    await recordInteraction("runLogOpen", async () => {
      await firstRun.click();
      await expect(page.getByText("Action Log", { exact: true }).first()).toBeVisible();
    });
    await page.getByRole("button", { name: "Back" }).first().click();
  }

  const settings = page.locator(".tree-row-main").filter({ hasText: "Settings" }).first();
  await recordInteraction("viewSwitch.settings", async () => {
    await settings.click();
    await expect(page.getByText("Flow Identity", { exact: true }).first()).toBeVisible();
  });

  const instructions = page.locator(".tree-row-main").filter({ hasText: "Instructions" }).first();
  await recordInteraction("viewSwitch.instructions", async () => {
    await instructions.click();
    await expect(page.getByText("Instruction Editor", { exact: true }).first()).toBeVisible();
  });

  await page.waitForTimeout(250);
  const snapshot = await collectUiPerformance(page, interactions, interactionMetrics);
  expect(snapshot.domNodes).toBeGreaterThan(0);
  expect(snapshot.graphDom?.nodes ?? 0).toBeLessThanOrEqual(UI_PERFORMANCE_BUDGETS.graphDomEntityCount);
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

test("bounds long tasks and retained heap across repeated project and view switching", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Chromium heap retention is measured once on desktop.");
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await installUiPerformanceCollection(page);
  await openFixtureProject(page, manifest.projects.representative);
  const initialHeap = await collectBrowserHeapUsage(page);
  const longTasks: Array<{ startTime: number; duration: number; cycle: number }> = [];
  const interactions: Record<string, number> = {};

  for (let cycle = 0; cycle < 5; cycle += 1) {
    interactions[`project-${cycle}-scale`] = await measureInteraction(page, async () => openFixtureProject(page, manifest.projects.scale), { waitForSettled: true });
    const firstFlow = page.locator(".tree-row-main").filter({ hasText: "Large Adaptive Flow 0" }).first();
    await firstFlow.click();
    const runtimeDebug = page.locator(".tree-row-main").filter({ hasText: "Runtime Debug" }).first();
    const router = page.locator(".tree-row-main").filter({ hasText: "Router" }).first();
    for (let viewCycle = 0; viewCycle < 4; viewCycle += 1) {
      await runtimeDebug.click();
      await expect(page.getByText("Runtime Debug", { exact: true }).first()).toBeVisible();
      await router.click();
      await expect(page.getByText("Router", { exact: true }).first()).toBeVisible();
    }
    const cycleSnapshot = await collectUiPerformance(page, interactions);
    longTasks.push(...cycleSnapshot.longTasks.map((task) => ({ ...task, cycle })));
    interactions[`project-${cycle}-representative`] = await measureInteraction(page, async () => openFixtureProject(page, manifest.projects.representative), { waitForSettled: true });
  }

  await openFixtureProject(page, manifest.projects.scale);
  const finalSnapshot = await collectUiPerformance(page, interactions);
  longTasks.push(...finalSnapshot.longTasks.map((task) => ({ ...task, cycle: 5 })));
  const finalHeap = await collectBrowserHeapUsage(page);
  const retainedBytes = Math.max(0, finalHeap.usedBytes - initialHeap.usedBytes);
  const retainedBudgetBytes = UI_PERFORMANCE_BUDGETS.studioSwitchRetainedHeapBytes;
  await writeUiPerformanceArtifact(testInfo, "studio-switch-retention", {
    ...finalSnapshot,
    longTasks,
    heap: { initial: initialHeap, final: finalHeap, retainedBytes, retainedBudgetBytes },
  });

  expect(retainedBytes, `Retained heap grew by ${Math.round(retainedBytes / 1024 / 1024)} MiB`).toBeLessThanOrEqual(retainedBudgetBytes);
  expect(longTasks.filter((task) => task.duration > 1_000), "No switch may block the main thread for one second").toEqual([]);
});
