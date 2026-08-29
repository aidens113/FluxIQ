import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { authenticate, openFixtureProject, readUiFixtureManifest } from "./support/app-fixture";
import {
  collectBrowserHeapUsage,
  collectUiPerformance,
  formatStudioSettledInteraction,
  installUiPerformanceCollection,
  measureInteraction,
  type StudioSettledInteractionMetrics,
  type UiPerformanceSnapshot,
  writeUiPerformanceArtifact,
} from "./support/performance";
import {
  AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS,
  AUTOMATION_STUDIO_RENDER_ISOLATION,
  missingCertificationCoverage,
  type AutomationStudioCertificationProfile,
  type AutomationStudioCertificationScenario,
} from "../src/features/automation-studio/testing/performance-certification";
import { UI_PERFORMANCE_BUDGETS, evaluateStudioScenarioBudgets, formatUiPerformanceViolations } from "../src/features/programs/ui-performance-budgets";

const SECURITY_PIN = process.env.FLUXIQ_E2E_SECURITY_PIN ?? "1234";
const profileProjects = { empty: "empty", small: "small", scale: "scale" } as const;
type Recorder = ReturnType<typeof createRecorder>;

for (const profile of Object.keys(profileProjects) as AutomationStudioCertificationProfile[]) {
  test("certifies Automation Studio " + profile + " interaction coverage", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Studio certification mutates one deterministic fixture and runs once on desktop.");
    const manifest = await readUiFixtureManifest();
    await authenticate(page, manifest);
    await installUiPerformanceCollection(page);
    const recorder = createRecorder(page, testInfo);

    await recorder.record("project.open", "projectOpen", async () => {
      await openFixtureProject(page, manifest.projects[profileProjects[profile]]);
    });

    if (profile !== "empty") {
      await exerciseHierarchyAndGraph(page, recorder);
      await exerciseRuntime(page, recorder);
    }
    await exerciseWorkspaceViews(page, recorder);
    if (profile === "small") await exerciseHierarchyMutations(page, recorder);

    let heap: UiPerformanceSnapshot["heap"];
    if (profile !== "empty") {
      const before = await collectBrowserHeapUsage(page);
      const alternate = profile === "small" ? manifest.projects.scale : manifest.projects.small;
      await recorder.record("project.switch", "project-" + profile + "-switch", async () => {
        await openFixtureProject(page, alternate);
      });
      const after = await collectBrowserHeapUsage(page);
      heap = {
        initial: before,
        final: after,
        retainedBytes: Math.max(0, after.usedBytes - before.usedBytes),
        retainedBudgetBytes: UI_PERFORMANCE_BUDGETS.studioSwitchRetainedHeapBytes,
      };
    }

    await recorder.record("project.close", "projectClose", async () => {
      await page.getByRole("button", { name: "Back to Projects" }).click();
      await expect(page.getByText("Choose a project", { exact: true })).toBeVisible();
    });

    expect(missingCertificationCoverage(recorder.certification, profile)).toEqual([]);
    const snapshot = await collectUiPerformance(page, recorder.interactions, recorder.metrics);
    if (heap) snapshot.heap = heap;
    expect(snapshot.domNodes).toBeGreaterThan(0);
    expect(snapshot.renderMetrics.length).toBeGreaterThan(0);
    await writeUiPerformanceArtifact(testInfo, "studio-" + profile + "-performance", snapshot);
    const budgetInteractionMetrics = Object.fromEntries(Object.entries(recorder.metrics).map(([name, metric]) => [name, { ...metric, duration: metric.operationDuration }]));
    const violations = evaluateStudioScenarioBudgets({ ...snapshot, interactionMetrics: budgetInteractionMetrics });
    expect(violations, formatUiPerformanceViolations(violations)).toEqual([]);
  });
}

test("records global program navigation and payload metrics", async ({ page }, testInfo) => {
  const manifest = await readUiFixtureManifest();
  await authenticate(page, manifest);
  await installUiPerformanceCollection(page);
  const interactions: Record<string, number> = {};
  for (const programId of ["background-tasks", "compute-control", "database-manager", "deployment-sync", "docs", "identity-access", "production-runner", "secret-keys"]) {
    interactions["open-" + programId] = await measureInteraction(page, async () => {
      await page.goto("/programs/" + programId, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
    });
  }
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
    interactions["project-" + cycle + "-scale"] = await measureInteraction(page, async () => openFixtureProject(page, manifest.projects.scale), { waitForSettled: true });
    await flowRow(page).click();
    const runtimeDebug = treeRow(page, "Runtime Debug");
    const router = treeRow(page, "Router");
    for (let viewCycle = 0; viewCycle < 4; viewCycle += 1) {
      await runtimeDebug.click();
      await expect(page.getByText("Runtime Debug", { exact: true }).first()).toBeVisible();
      await router.click();
      await expect(page.getByText("Router", { exact: true }).first()).toBeVisible();
    }
    const cycleSnapshot = await collectUiPerformance(page, interactions);
    longTasks.push(...cycleSnapshot.longTasks.map((task) => ({ ...task, cycle })));
    interactions["project-" + cycle + "-representative"] = await measureInteraction(page, async () => openFixtureProject(page, manifest.projects.representative), { waitForSettled: true });
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
  expect(retainedBytes, "Retained heap grew by " + Math.round(retainedBytes / 1024 / 1024) + " MiB").toBeLessThanOrEqual(retainedBudgetBytes);
  expect(longTasks.filter((task) => task.duration > 1_000), "No switch may block the main thread for one second").toEqual([]);
});

function createRecorder(page: Page, testInfo: TestInfo) {
  const interactions: Record<string, number> = {};
  const metrics: Record<string, StudioSettledInteractionMetrics> = {};
  const certification: Record<string, StudioSettledInteractionMetrics> = {};
  return {
    interactions,
    metrics,
    certification,
    async record(scenario: AutomationStudioCertificationScenario, budgetName: string, operation: () => Promise<void>) {
      const result = await measureInteraction(page, operation, { returnMetrics: true });
      interactions[budgetName] = result.duration;
      metrics[budgetName] = result;
      certification[scenario] = result;
      testInfo.annotations.push({ type: "studio:" + scenario, description: formatStudioSettledInteraction(result) });
      expect(result.domBefore, scenario + " DOM baseline").toEqual(expect.any(Number));
      expect(result.domAfter, scenario + " DOM result").toEqual(expect.any(Number));
      expect(result.apiMetricCount, scenario + " API metric count").toEqual(expect.any(Number));
      expect(result.renderCounts, scenario + " exact render counts").toBeDefined();
      expect(result.longTaskEntries, scenario + " long-task entries").toBeDefined();
      expect(result.operationDuration, scenario + " operation budget").toBeLessThanOrEqual(AUTOMATION_STUDIO_CERTIFICATION_SCENARIOS[scenario].durationMs);
      assertRenderIsolation(scenario, result);
      return result;
    },
  };
}

async function exerciseHierarchyAndGraph(page: Page, recorder: Recorder) {
  const flowsRoot = page.getByRole("treeitem", { name: /Flows/ }).first();
  await recorder.record("hierarchy.folderToggle", "folderToggle.root", async () => {
    await flowsRoot.click();
    await expect(flowsRoot).toHaveAttribute("aria-expanded", "false");
  });
  await flowsRoot.click();
  await expect(flowsRoot).toHaveAttribute("aria-expanded", "true");
  await recorder.record("hierarchy.rowClick", "viewSwitch.flow", async () => {
    await flowRow(page).click();
    await expect(page.getByText("Router", { exact: true }).first()).toBeVisible();
  });

  await treeRow(page, "Nodes").click();
  const frame = page.getByLabel("Nodes whiteboard");
  await expect(frame).toBeVisible();
  const firstNode = page.locator(".react-flow__node").first();
  await expect(firstNode).toBeVisible();
  await recorder.record("graph.select", "graphSelect.firstNode", async () => {
    await firstNode.click();
    await expect(firstNode).toHaveClass(/selected/);
  });

  const nodeBox = await firstNode.boundingBox();
  if (!nodeBox) throw new Error("Graph node has no measurable bounds.");
  await recorder.record("graph.drag", "graphDrag.firstNode", async () => {
    await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 32, nodeBox.y + nodeBox.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator(".automation-graph-save-state")).toContainText("Unsaved changes");
  });

  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error("Graph canvas has no measurable bounds.");
  await recorder.record("graph.rightDragSelection", "graphRightDragSelection", async () => {
    await page.mouse.move(frameBox.x + 24, frameBox.y + 100);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(frameBox.x + Math.min(420, frameBox.width - 24), frameBox.y + Math.min(420, frameBox.height - 24), { steps: 5 });
    await page.mouse.up({ button: "right" });
  });

  await recorder.record("graph.save", "graphSave", async () => {
    page.once("dialog", (dialog) => void dialog.accept(SECURITY_PIN));
    await frame.press("Control+S");
    await expect(page.locator(".automation-graph-save-state")).toContainText("Saved");
  });
}

async function exerciseRuntime(page: Page, recorder: Recorder) {
  await recorder.record("runtime.listOpen", "runtimeDebugOpen", async () => {
    await treeRow(page, "Runtime Debug").click();
    await expect(page.getByText("Runtime Debug", { exact: true }).first()).toBeVisible();
    await expect(page.locator(".automation-runtime-run-row").first()).toBeVisible();
  });
  await recorder.record("runtime.runLogOpen", "runLogOpen", async () => {
    await page.locator(".automation-runtime-run-row").first().click();
    await expect(page.getByText("Action Log", { exact: true }).first()).toBeVisible();
  });
  await page.getByRole("button", { name: "Back" }).first().click();
}

async function exerciseWorkspaceViews(page: Page, recorder: Recorder) {
  await recorder.record("overlay.open", "overlayOpen.tabPicker", async () => {
    await page.getByRole("button", { name: "Add tab" }).first().click();
    await expect(page.locator(".automation-window-adder-panel")).toBeVisible();
  });
  const picker = page.locator(".automation-window-adder-panel");
  await recorder.record("overlay.type", "overlayTyping.tabPicker", async () => {
    await picker.getByRole("searchbox").fill("connected");
    await expect(picker.getByRole("button", { name: /^Connected Clients/ })).toBeVisible();
  });
  await recorder.record("view.coldOpen", "coldViewOpen.clients", async () => {
    await picker.getByRole("button", { name: /^Connected Clients/ }).click();
    await expect(page.getByRole("tab", { name: /Connected Clients/ })).toHaveAttribute("aria-selected", "true");
  });

  const tabs = page.getByRole("tab");
  const firstTab = tabs.first();
  const clientsTab = page.getByRole("tab", { name: /Connected Clients/ });
  if (await tabs.count() > 1) {
    await firstTab.click();
    await expect(firstTab).toHaveAttribute("aria-selected", "true");
  }
  await recorder.record("view.warmSwitch", "warmViewSwitch", async () => {
    await clientsTab.click();
    await expect(clientsTab).toHaveAttribute("aria-selected", "true");
  });

  const hierarchyResizer = page.getByRole("separator", { name: "Resize project hierarchy" });
  await recorder.record("workspace.resize", "resize.hierarchy", async () => {
    await hierarchyResizer.focus();
    await hierarchyResizer.press("ArrowRight");
  });
}

async function exerciseHierarchyMutations(page: Page, recorder: Recorder) {
  await createHierarchyItem(page, recorder, "Flow", "Performance Fixture Flow", "hierarchy.createFlow", "createFlow");
  await deleteHierarchyItem(page, recorder, "Performance Fixture Flow", "hierarchy.deleteFlow", "deleteFlow");
  await createHierarchyItem(page, recorder, "Folder", "Performance Fixture Folder", "hierarchy.createFolder", "createFolder");
  await deleteHierarchyItem(page, recorder, "Performance Fixture Folder", "hierarchy.deleteFolder", "deleteFolder");
}

async function createHierarchyItem(page: Page, recorder: Recorder, kind: "Flow" | "Folder", name: string, scenario: "hierarchy.createFlow" | "hierarchy.createFolder", budgetName: "createFlow" | "createFolder") {
  await page.getByRole("button", { name: "Add Flow" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: new RegExp("^" + kind) }).click();
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Security PIN").fill(SECURITY_PIN);
  await recorder.record(scenario, budgetName, async () => {
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(treeRow(page, name)).toBeVisible();
  });
}

async function deleteHierarchyItem(page: Page, recorder: Recorder, name: string, scenario: "hierarchy.deleteFlow" | "hierarchy.deleteFolder", budgetName: "deleteFlow" | "deleteFolder") {
  const row = page.locator(".automation-tree-row").filter({ hasText: name }).first();
  await row.getByRole("button", { name: name + " actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Security PIN").fill(SECURITY_PIN);
  await recorder.record(scenario, budgetName, async () => {
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(treeRow(page, name)).toHaveCount(0);
  });
}

function flowRow(page: Page) {
  return page.locator(".tree-row-main").filter({ hasText: /^Large Adaptive Flow 0/ }).first();
}

function treeRow(page: Page, label: string) {
  return page.locator(".tree-row-main").filter({ hasText: new RegExp("^" + escapeRegExp(label)) }).first();
}

function assertRenderIsolation(scenario: AutomationStudioCertificationScenario, metric: StudioSettledInteractionMetrics) {
  const isolation = AUTOMATION_STUDIO_RENDER_ISOLATION[scenario];
  if (!isolation) return;
  for (const boundary of isolation.forbidden) {
    expect(metric.renderCounts?.[boundary] ?? 0, scenario + " must not render " + boundary).toBe(0);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
}