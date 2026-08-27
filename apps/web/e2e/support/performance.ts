import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
import type { UiRequestPerformanceMetric } from "../../src/features/programs/ui-performance-budgets";

export type UiPerformanceSnapshot = {
  navigation: Record<string, number>;
  resources: {
    count: number;
    transferBytes: number;
    decodedBodyBytes: number;
  };
  domNodes: number;
  apiMetrics: UiRequestPerformanceMetric[];
  longTasks: Array<{ startTime: number; duration: number }>;
  renderMetrics: Array<{ component: string; count: number; recordedAt: number }>;
  interactions: Record<string, number>;
};

export async function installUiPerformanceCollection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const metrics = {
      apiMetrics: [] as UiRequestPerformanceMetric[],
      longTasks: [] as Array<{ startTime: number; duration: number }>,
      renderMetrics: [] as Array<{ component: string; count: number; recordedAt: number }>,
    };
    Object.defineProperty(window, "__fluxiqUiPerformance", {
      configurable: true,
      value: metrics,
    });
    window.addEventListener("program-api:metric", (event) => {
      metrics.apiMetrics.push((event as CustomEvent<UiRequestPerformanceMetric>).detail);
    });
    window.addEventListener("ui-render:metric", (event) => {
      metrics.renderMetrics.push((event as CustomEvent).detail);
    });
    if ("PerformanceObserver" in window) {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            metrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {
        // Long-task entries are not available in every browser build.
      }
    }
  });
}

export async function measureInteraction(page: Page, operation: () => Promise<void>): Promise<number> {
  const startedAt = await page.evaluate(() => performance.now());
  await operation();
  const finishedAt = await page.evaluate(() => performance.now());
  return finishedAt - startedAt;
}

export async function collectUiPerformance(
  page: Page,
  interactions: Record<string, number>,
): Promise<UiPerformanceSnapshot> {
  return await page.evaluate((interactionValues) => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const collected = (window as typeof window & {
      __fluxiqUiPerformance?: {
        apiMetrics: UiRequestPerformanceMetric[];
        longTasks: Array<{ startTime: number; duration: number }>;
        renderMetrics: Array<{ component: string; count: number; recordedAt: number }>;
      };
    }).__fluxiqUiPerformance;
    return {
      navigation: navigation ? {
        duration: navigation.duration,
        domInteractive: navigation.domInteractive,
        domContentLoaded: navigation.domContentLoadedEventEnd,
        loadEvent: navigation.loadEventEnd,
        responseEnd: navigation.responseEnd,
      } : {},
      resources: {
        count: resources.length,
        transferBytes: resources.reduce((total, entry) => total + entry.transferSize, 0),
        decodedBodyBytes: resources.reduce((total, entry) => total + entry.decodedBodySize, 0),
      },
      domNodes: document.getElementsByTagName("*").length,
      apiMetrics: collected?.apiMetrics ?? [],
      longTasks: collected?.longTasks ?? [],
      renderMetrics: collected?.renderMetrics ?? [],
      interactions: interactionValues,
    };
  }, interactions);
}

export async function writeUiPerformanceArtifact(
  testInfo: TestInfo,
  name: string,
  snapshot: UiPerformanceSnapshot,
): Promise<void> {
  await writeFile(testInfo.outputPath(`${name}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
