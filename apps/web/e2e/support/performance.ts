import { writeFile } from "node:fs/promises";
import type { Page, Request, TestInfo } from "@playwright/test";
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
  interactionMetrics: Record<string, StudioSettledInteractionMetrics> | undefined;
  graphDom?: {
    nodes: number;
    edges: number;
    minimapNodes: number;
  };
  heap?: {
    initial: BrowserHeapUsage;
    final: BrowserHeapUsage;
    retainedBytes: number;
    retainedBudgetBytes: number;
  };
};

export type BrowserHeapUsage = {
  usedBytes: number;
  totalBytes: number;
  collectedAt: number;
};

export type StudioSettledInteractionMetrics = {
  duration: number;
  operationDuration: number;
  settleDuration: number;
  requestCount: number;
  longTaskCount: number;
  longTaskDuration: number;
  lastActiveRequestNames: string[];
  domSamples: number[];
  timedOut: boolean;
};

export type StudioSettledInteractionOptions = {
  waitForSettled?: boolean;
  returnMetrics?: boolean;
  timeoutMs?: number;
  quietMs?: number;
  stableDomSamples?: number;
  animationFrames?: number;
  includeAllRequests?: boolean;
};

type RequestTracker = {
  activeRequests: Map<Request, string>;
  completedRequestCount: number;
  seenRequestCount: number;
  lastActiveRequestNames: string[];
  dispose: () => void;
};

const DEFAULT_SETTLED_TIMEOUT_MS = 5_000;
const DEFAULT_SETTLED_QUIET_MS = 120;
const DEFAULT_STABLE_DOM_SAMPLES = 3;
const DEFAULT_SETTLED_ANIMATION_FRAMES = 2;
const MAX_LAST_ACTIVE_REQUEST_NAMES = 8;

export async function collectBrowserHeapUsage(page: Page): Promise<BrowserHeapUsage> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("HeapProfiler.collectGarbage");
    const usage = await session.send("Runtime.getHeapUsage");
    return {
      usedBytes: usage.usedSize,
      totalBytes: usage.totalSize,
      collectedAt: Date.now(),
    };
  } finally {
    await session.detach();
  }
}

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

function isTrackedRequest(request: Request, includeAllRequests: boolean): boolean {
  if (includeAllRequests) {
    return true;
  }
  const resourceType = request.resourceType();
  if (resourceType !== "fetch" && resourceType !== "xhr" && resourceType !== "document") {
    return false;
  }
  try {
    const url = new URL(request.url());
    return url.pathname.includes("/api/") || url.pathname.includes("/programs") || url.pathname.includes("/projects");
  } catch {
    return false;
  }
}

function describeRequest(request: Request): string {
  let path = request.url();
  try {
    const url = new URL(request.url());
    path = `${request.method()} ${url.pathname}`;
  } catch {
    path = `${request.method()} ${request.url()}`;
  }

  const postData = request.postData();
  if (!postData) {
    return path;
  }
  try {
    const parsed = JSON.parse(postData) as Record<string, unknown>;
    const action = parsed.action ?? parsed.command ?? parsed.programId ?? parsed.program;
    return typeof action === "string" ? `${path} ${action}` : path;
  } catch {
    return path;
  }
}

function createRequestTracker(page: Page, options: StudioSettledInteractionOptions): RequestTracker {
  const activeRequests = new Map<Request, string>();
  const lastActiveRequestNames: string[] = [];
  let completedRequestCount = 0;
  let seenRequestCount = 0;

  const rememberRequest = (name: string) => {
    lastActiveRequestNames.push(name);
    if (lastActiveRequestNames.length > MAX_LAST_ACTIVE_REQUEST_NAMES) {
      lastActiveRequestNames.shift();
    }
  };
  const onRequest = (request: Request) => {
    if (!isTrackedRequest(request, options.includeAllRequests === true)) {
      return;
    }
    const name = describeRequest(request);
    seenRequestCount += 1;
    activeRequests.set(request, name);
    rememberRequest(name);
  };
  const onDone = (request: Request) => {
    const name = activeRequests.get(request);
    if (!name) {
      return;
    }
    activeRequests.delete(request);
    completedRequestCount += 1;
    rememberRequest(name);
  };

  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);

  return {
    activeRequests,
    get completedRequestCount() {
      return completedRequestCount;
    },
    get seenRequestCount() {
      return seenRequestCount;
    },
    lastActiveRequestNames,
    dispose: () => {
      page.off("request", onRequest);
      page.off("requestfinished", onDone);
      page.off("requestfailed", onDone);
    },
  };
}

async function waitForAnimationFrames(page: Page, frameCount: number): Promise<void> {
  await page.evaluate((frames) => {
    return new Promise<void>((resolve) => {
      let remaining = Math.max(0, frames);
      const tick = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, frameCount);
}

async function readLongTasksSince(page: Page, startedAt: number): Promise<Array<{ startTime: number; duration: number }>> {
  return await page.evaluate((interactionStart) => {
    const collected = (window as typeof window & {
      __fluxiqUiPerformance?: {
        longTasks: Array<{ startTime: number; duration: number }>;
      };
    }).__fluxiqUiPerformance;
    return (collected?.longTasks ?? []).filter((task) => task.startTime >= interactionStart);
  }, startedAt);
}

async function readDomNodeCount(page: Page): Promise<number> {
  return await page.evaluate(() => document.getElementsByTagName("*").length);
}

function hasStableTrailingSamples(samples: number[], requiredSamples: number): boolean {
  if (samples.length < requiredSamples) {
    return false;
  }
  const trailing = samples.slice(-requiredSamples);
  return trailing.every((sample) => sample === trailing[0]);
}

async function waitForStudioSettledWithTracker(
  page: Page,
  interactionStartedAt: number,
  operationDuration: number,
  tracker: RequestTracker,
  options: StudioSettledInteractionOptions = {},
): Promise<StudioSettledInteractionMetrics> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SETTLED_TIMEOUT_MS;
  const quietMs = options.quietMs ?? DEFAULT_SETTLED_QUIET_MS;
  const stableDomSamples = Math.max(1, options.stableDomSamples ?? DEFAULT_STABLE_DOM_SAMPLES);
  const animationFrames = Math.max(1, options.animationFrames ?? DEFAULT_SETTLED_ANIMATION_FRAMES);
  const waitStartedAt = Date.now();
  const domSamples: number[] = [];
  let lastBusyAt = Date.now();
  let lastLongTaskEnd = interactionStartedAt;
  let timedOut = false;

  while (Date.now() - waitStartedAt <= timeoutMs) {
    await waitForAnimationFrames(page, animationFrames);
    const [domNodeCount, longTasks, now] = await Promise.all([
      readDomNodeCount(page),
      readLongTasksSince(page, interactionStartedAt),
      page.evaluate(() => performance.now()),
    ]);
    domSamples.push(domNodeCount);
    if (domSamples.length > stableDomSamples * 2) {
      domSamples.shift();
    }

    lastLongTaskEnd = longTasks.reduce(
      (latestEnd, task) => Math.max(latestEnd, task.startTime + task.duration),
      lastLongTaskEnd,
    );
    const isBusy = tracker.activeRequests.size > 0 || lastLongTaskEnd > now - quietMs || !hasStableTrailingSamples(domSamples, stableDomSamples);
    if (isBusy) {
      lastBusyAt = Date.now();
      continue;
    }
    if (Date.now() - lastBusyAt >= quietMs) {
      const finishedAt = await page.evaluate(() => performance.now());
      return {
        duration: finishedAt - interactionStartedAt,
        operationDuration,
        settleDuration: Math.max(0, finishedAt - interactionStartedAt - operationDuration),
        requestCount: tracker.seenRequestCount,
        longTaskCount: longTasks.length,
        longTaskDuration: longTasks.reduce((total, task) => total + task.duration, 0),
        lastActiveRequestNames: [...tracker.lastActiveRequestNames],
        domSamples: [...domSamples],
        timedOut: false,
      };
    }
  }

  timedOut = true;
  const [finishedAt, longTasks] = await Promise.all([
    page.evaluate(() => performance.now()),
    readLongTasksSince(page, interactionStartedAt),
  ]);
  return {
    duration: finishedAt - interactionStartedAt,
    operationDuration,
    settleDuration: Math.max(0, finishedAt - interactionStartedAt - operationDuration),
    requestCount: tracker.seenRequestCount,
    longTaskCount: longTasks.length,
    longTaskDuration: longTasks.reduce((total, task) => total + task.duration, 0),
    lastActiveRequestNames: [...tracker.lastActiveRequestNames],
    domSamples: [...domSamples],
    timedOut,
  };
}

export async function waitForStudioSettled(
  page: Page,
  options: StudioSettledInteractionOptions = {},
): Promise<StudioSettledInteractionMetrics> {
  const startedAt = await page.evaluate(() => performance.now());
  const tracker = createRequestTracker(page, options);
  try {
    return await waitForStudioSettledWithTracker(page, startedAt, 0, tracker, options);
  } finally {
    tracker.dispose();
  }
}

export function formatStudioSettledInteraction(metrics: StudioSettledInteractionMetrics): string {
  const requests = metrics.lastActiveRequestNames.length > 0
    ? ` last requests: ${metrics.lastActiveRequestNames.join(", ")}`
    : "";
  return `duration=${Math.round(metrics.duration)}ms operation=${Math.round(metrics.operationDuration)}ms settle=${Math.round(metrics.settleDuration)}ms requests=${metrics.requestCount} longTasks=${metrics.longTaskCount} timedOut=${metrics.timedOut}${requests}`;
}

export async function measureInteraction(page: Page, operation: () => Promise<void>): Promise<number>;
export async function measureInteraction(
  page: Page,
  operation: () => Promise<void>,
  options: StudioSettledInteractionOptions & { returnMetrics?: false },
): Promise<number>;
export async function measureInteraction(
  page: Page,
  operation: () => Promise<void>,
  options: StudioSettledInteractionOptions & { returnMetrics: true },
): Promise<StudioSettledInteractionMetrics>;
export async function measureInteraction(
  page: Page,
  operation: () => Promise<void>,
  options?: StudioSettledInteractionOptions,
): Promise<number | StudioSettledInteractionMetrics>;
export async function measureInteraction(
  page: Page,
  operation: () => Promise<void>,
  options: StudioSettledInteractionOptions = {},
): Promise<number | StudioSettledInteractionMetrics> {
  const startedAt = await page.evaluate(() => performance.now());
  const tracker = options.waitForSettled === true || options.returnMetrics === true ? createRequestTracker(page, options) : null;
  await operation();
  const finishedAt = await page.evaluate(() => performance.now());
  const operationDuration = finishedAt - startedAt;
  if (!tracker) {
    return operationDuration;
  }
  try {
    const metrics = await waitForStudioSettledWithTracker(page, startedAt, operationDuration, tracker, options);
    return options.returnMetrics === true ? metrics : metrics.duration;
  } finally {
    tracker.dispose();
  }
}

export async function collectUiPerformance(
  page: Page,
  interactions: Record<string, number>,
  interactionMetrics?: Record<string, StudioSettledInteractionMetrics>,
): Promise<UiPerformanceSnapshot> {
  return await page.evaluate(({ interactionValues, settledInteractionValues }) => {
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
      interactionMetrics: settledInteractionValues,
      graphDom: {
        nodes: document.querySelectorAll(".react-flow__node").length,
        edges: document.querySelectorAll(".react-flow__edge").length,
        minimapNodes: document.querySelectorAll(".react-flow__minimap .react-flow__minimap-node").length,
      },
    };
  }, { interactionValues: interactions, settledInteractionValues: interactionMetrics });
}

export async function writeUiPerformanceArtifact(
  testInfo: TestInfo,
  name: string,
  snapshot: UiPerformanceSnapshot,
): Promise<void> {
  await writeFile(testInfo.outputPath(`${name}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
