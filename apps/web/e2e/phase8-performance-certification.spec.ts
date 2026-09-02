import { readFile, writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { authenticate, openFixtureProject, openStudioView, readUiFixtureManifest, requirePhase8Project, selectFixtureFlow, selectFixtureRecording, studioProjectNavigation, studioViewTab, type FixtureProject, type StudioViewTitle } from "./support/app-fixture";
import {
  collectBrowserHeapUsage,
  collectPhase8BrowserResources,
  collectUiPerformance,
  installPhase8ResourceCollection,
  installUiPerformanceCollection,
  measureAttributeFeedback,
  measureAnimationFrameDurations,
  measureInteraction,
  phase8EnvironmentMetadata,
  waitForStudioSettled,
  type StudioSettledInteractionMetrics,
} from "./support/performance";
import {
  PHASE8_BUDGETS,
  evaluatePhase8Budgets,
  evaluatePhase8Regression,
  phase8Statistics,
  type Phase8FixtureProfileName,
} from "../src/features/automation-studio/testing/phase8-certification";

const populatedViewNames = ["Connected Clients", "Timeline", "Router", "Subflows", "Instructions", "Adaptations", "Settings", "Runtime Debug", "Problems", "Inspector"] as const satisfies readonly StudioViewTitle[];
const emptyViewNames = ["Connected Clients", "Nodes", "Router", "Subflows", "Instructions", "Adaptations", "Settings", "Runtime Debug", "Problems", "Inspector"] as const satisfies readonly StudioViewTitle[];

test("certifies Empty, Ordinary, and Scale interaction and resource budgets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Normalized Phase 8 performance runs on pinned desktop Chromium.");
  test.setTimeout(20 * 60_000);
  const environment = phase8EnvironmentMetadata(testInfo);
  if (environment.normalized) expect(environment.buildMode, "Normalized certification requires a production build host.").toBe("production");
  const manifest = await readUiFixtureManifest();
  await installUiPerformanceCollection(page);
  await installPhase8ResourceCollection(page);
  const updateDepthWarnings: string[] = [];
  page.on("console", (message) => {
    if (/Maximum update depth exceeded|too many re-renders/iu.test(message.text())) updateDepthWarnings.push(message.text());
  });
  await authenticate(page, manifest);

  const reports = [];
  const requestedProfile = process.env.FLUXIQ_E2E_PERFORMANCE_PROFILE;
  expect([undefined, "empty", "ordinary", "scale"], "FLUXIQ_E2E_PERFORMANCE_PROFILE").toContain(requestedProfile);
  const profiles: Phase8FixtureProfileName[] = requestedProfile
    ? [requestedProfile as Phase8FixtureProfileName]
    : ["empty", "ordinary", "scale"];
  for (const profile of profiles) {
    const project = requirePhase8Project(manifest, profile);
    reports.push(await certifyProfile(page, testInfo, profile, project, updateDepthWarnings));
  }
  const report = { schemaVersion: 1, environment, protocol: { scope: requestedProfile ? "diagnostic" : "certification", profiles, warmups: 2, repetitions: 10, soakCycles: 50, viewsPerCycle: 10 }, reports };
  await writeFile(testInfo.outputPath("phase8-performance-certification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  expect(reports.flatMap((item) => item.violations), "Phase 8 absolute and regression budgets").toEqual([]);
});

async function certifyProfile(page: Page, testInfo: TestInfo, profile: Phase8FixtureProfileName, project: FixtureProject, warnings: string[]) {
  const projectEntryMs: number[] = [];
  const shellFeedbackMs: number[] = [];
  for (let repetition = 0; repetition < PHASE8_BUDGETS.warmupRepetitions + PHASE8_BUDGETS.measuredRepetitions; repetition += 1) {
    const started = performance.now();
    await page.goto(`/programs/automation-studio?project=${encodeURIComponent(project.id)}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".automation-studio-shell")).toBeVisible();
    const duration = performance.now() - started;
    if (repetition >= PHASE8_BUDGETS.warmupRepetitions) {
      projectEntryMs.push(duration);
      shellFeedbackMs.push(await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        return navigation ? Math.max(0, navigation.domContentLoadedEventEnd - navigation.responseEnd) : 0;
      }));
    }
  }
  await openFixtureProject(page, project);

  const viewNames = profile === "empty" ? emptyViewNames : populatedViewNames;
  await ensureViewsOpen(page, project, viewNames);
  const baselineResources = await collectPhase8BrowserResources(page);
  const baselineHeap = await collectBrowserHeapUsage(page);
  const inputFeedbackMs: number[] = [];
  const warmSwitchMs: number[] = [];
  const interactionLongTasks: number[] = [];
  const metrics: Record<string, StudioSettledInteractionMetrics> = {};
  const tabs = viewNames.map((name) => studioViewTab(page, name));

  for (let warmup = 0; warmup < PHASE8_BUDGETS.warmupRepetitions; warmup += 1) {
    for (const tab of tabs) {
      await tab.click();
      await waitForStudioViewSettled(page);
    }
  }
  for (let repetition = 0; repetition < PHASE8_BUDGETS.measuredRepetitions; repetition += 1) {
    const tab = tabs[repetition % tabs.length]!;
    const measured = await measureAttributeFeedback(page, tab, () => measureInteraction(page, async () => {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await waitForStudioViewSettled(page);
    }, { returnMetrics: true, timeoutMs: 2_000 }), {
      attribute: "aria-selected",
      expected: "true",
      timeoutMs: 2_000
    });
    const result = measured.value;
    inputFeedbackMs.push(measured.feedbackMs);
    metrics[`inputFeedback.${repetition}`] = { ...result, feedbackMs: measured.feedbackMs };
  }

  const retainedWarmTabs = tabs.slice(-PHASE8_BUDGETS.desktopWarmViewCap);
  for (const tab of retainedWarmTabs) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await waitForStudioViewSettled(page);
  }
  for (let repetition = 0; repetition < PHASE8_BUDGETS.measuredRepetitions; repetition += 1) {
    const tab = retainedWarmTabs[repetition % retainedWarmTabs.length]!;
    const measured = await measureAttributeFeedback(page, tab, () => measureInteraction(page, async () => {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await waitForStudioViewSettled(page);
    }, { returnMetrics: true, timeoutMs: 2_000 }), {
      attribute: "aria-selected",
      expected: "true",
      timeoutMs: 2_000
    });
    const result = measured.value;
    warmSwitchMs.push(measured.feedbackMs);
    interactionLongTasks.push(...(result.longTaskEntries ?? []).map((entry) => entry.duration));
    metrics[`warmSwitch.${repetition}`] = { ...result, feedbackMs: measured.feedbackMs };
  }

  const treeScroller = studioProjectNavigation(page);
  const virtualScrollFramesMs = await measureAnimationFrameDurations(page, async () => {
    await treeScroller.evaluate(async (element) => {
      for (let index = 0; index < 40; index += 1) {
        element.scrollTop = (index % 2 ? 0 : element.scrollHeight);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
  });

  for (let cycle = 0; cycle < PHASE8_BUDGETS.soakCycles; cycle += 1) {
    for (const tab of tabs) {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
  }
  await waitForStudioViewSettled(page);
  const finalResources = await collectPhase8BrowserResources(page);
  const finalHeap = await collectBrowserHeapUsage(page);
  const uiSnapshot = await collectUiPerformance(page, {}, metrics);
  const axe = await new AxeBuilder({ page }).analyze();
  const criticalAccessibilityViolations = axe.violations.filter((violation) => violation.impact === "critical").length;
  const violations = evaluatePhase8Budgets({
    profile,
    inputFeedbackMs,
    warmSwitchMs,
    projectEntryMs,
    shellFeedbackMs,
    coreInteractionLongTasksMs: interactionLongTasks,
    virtualScrollFramesMs,
    domNodes: finalResources.domNodes,
    warmViews: finalResources.warmViews,
    constrained: false,
    listenerBaseline: baselineResources.listeners,
    listenerFinal: finalResources.listeners,
    subscriptionBaseline: baselineResources.subscriptions,
    subscriptionFinal: finalResources.subscriptions,
    heapBaselineBytes: baselineHeap.usedBytes,
    heapFinalBytes: finalHeap.usedBytes,
    cacheWithinBounds: finalResources.cache.withinBounds,
    updateDepthWarnings: warnings.length,
    criticalAccessibilityViolations,
  });
  const accepted = await readAcceptedBaseline(profile);
  if (accepted?.warmSwitchP95Ms) violations.push(...evaluatePhase8Regression(phase8Statistics(warmSwitchMs).p95, accepted.warmSwitchP95Ms));
  return {
    profile,
    statistics: {
      inputFeedback: phase8Statistics(inputFeedbackMs),
      warmSwitch: phase8Statistics(warmSwitchMs),
      projectEntry: phase8Statistics(projectEntryMs),
      shellFeedback: phase8Statistics(shellFeedbackMs),
      virtualScrollFrames: phase8Statistics(virtualScrollFramesMs),
    },
    resources: { baseline: baselineResources, final: finalResources, heap: { baseline: baselineHeap, final: finalHeap } },
    apiMetrics: uiSnapshot.apiMetrics,
    interactions: metrics,
    reactCommits: uiSnapshot.renderMetrics,
    accessibility: { criticalViolations: axe.violations.filter((violation) => violation.impact === "critical") },
    longTasks: interactionLongTasks,
    violations,
  };
}

async function waitForStudioViewSettled(page: Page): Promise<void> {
  await expect(page.locator('.automation-view-container[data-view-selection-pending="true"]')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator(".automation-view-activation-placeholder")).toHaveCount(0, { timeout: 10_000 });
  const settled = await waitForStudioSettled(page, { quietMs: 160, stableDomSamples: 3, timeoutMs: 10_000 });
  expect(settled.timedOut, "Studio view did not become idle after durable activation.").toBe(false);
}

async function ensureViewsOpen(page: Page, project: FixtureProject, viewNames: readonly StudioViewTitle[]): Promise<void> {
  if (viewNames.includes("Timeline")) {
    await selectFixtureRecording(page, project);
    await openStudioView(page, "Timeline");
    await expect(page.locator(".automation-view-activation-placeholder")).toHaveCount(0);
  }
  await selectFixtureFlow(page, project);
  for (const name of viewNames) {
    if (name === "Timeline") continue;
    await openStudioView(page, name);
    await expect(page.locator(".automation-view-activation-placeholder")).toHaveCount(0);
  }
}

async function readAcceptedBaseline(profile: string): Promise<{ warmSwitchP95Ms?: number } | null> {
  const target = process.env.FLUXIQ_E2E_ACCEPTED_BASELINE;
  if (!target) return null;
  const baseline = JSON.parse(await readFile(target, "utf8")) as Record<string, { warmSwitchP95Ms?: number }>;
  return baseline[profile] ?? null;
}
