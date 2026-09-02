import { writeFile } from "node:fs/promises";
import { cpus, platform, release, totalmem } from "node:os";
import type { Locator, Page, Request, TestInfo } from "@playwright/test";
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

export type Phase8BrowserResourceSnapshot = {
  listeners: number;
  peakListeners: number;
  subscriptions: number;
  peakSubscriptions: number;
  domNodes: number;
  warmViews: number;
  cache: {
    entries: number;
    projects: number;
    totalChars: number;
    largestEntryChars: number;
    withinBounds: boolean;
  };
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
  feedbackMs?: number;
  apiMetricCount?: number;
  domBefore?: number;
  domAfter?: number;
  domDelta?: number;
  renderMetrics?: Array<{ component: string; count: number; recordedAt: number }>;
  renderCounts?: Record<string, number>;
  longTaskEntries?: Array<{ startTime: number; duration: number }>;
};

type UiPerformanceCursor = {
  timeOrigin: number;
  apiMetricIndex: number;
  longTaskIndex: number;
  renderMetricIndex: number;
  domNodes: number;
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
    const instrumentedWindow = window as typeof window & {
      __FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__?: boolean;
      __FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__?: boolean;
    };
    instrumentedWindow.__FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__ = true;
    instrumentedWindow.__FLUXIQ_ENABLE_AUTOMATION_STUDIO_TELEMETRY__ = true;
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

export async function installPhase8ResourceCollection(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type ResourceOwner = Window & {
      __FLUXIQ_ENABLE_PHASE8_RESOURCE_TELEMETRY__?: boolean;
      __fluxiqPhase8Resources?: { listeners: number; peakListeners: number; subscriptions: number; peakSubscriptions: number };
    };
    const owner = window as ResourceOwner;
    owner.__FLUXIQ_ENABLE_PHASE8_RESOURCE_TELEMETRY__ = true;
    const state = owner.__fluxiqPhase8Resources ??= { listeners: 0, peakListeners: 0, subscriptions: 0, peakSubscriptions: 0 };
    const registrations = new Map<EventTarget, Map<string, Map<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>>>();
    const isDurableGlobalTarget = (target: EventTarget) => target === window || target === document || target === window.visualViewport;
    const registrationKey = (type: string, options?: boolean | AddEventListenerOptions) => {
      const capture = typeof options === "boolean" ? options : options?.capture === true;
      return `${type}:${capture ? "capture" : "bubble"}`;
    };
    const releaseRegistration = (target: EventTarget, key: string, listener: EventListenerOrEventListenerObject) => {
      const listeners = registrations.get(target)?.get(key);
      if (!listeners?.delete(listener)) return;
      state.listeners = Math.max(0, state.listeners - 1);
      if (!listeners.size) registrations.get(target)?.delete(key);
    };
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (listener && isDurableGlobalTarget(this)) {
        const key = registrationKey(type, options);
        const byType = registrations.get(this) ?? new Map<string, Map<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>>();
        const listeners = byType.get(key) ?? new Map<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>();
        if (!listeners.has(listener)) {
          const once = typeof options === "object" && options?.once === true;
          const registered = once
            ? function(this: EventTarget, event: Event) {
              releaseRegistration(this, key, listener);
              if (typeof listener === "function") return listener.call(this, event);
              return listener.handleEvent(event);
            }
            : listener;
          listeners.set(listener, registered);
          byType.set(key, listeners);
          registrations.set(this, byType);
          state.listeners += 1;
          state.peakListeners = Math.max(state.peakListeners, state.listeners);
          return originalAdd.call(this, type, registered, options);
        }
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (listener && isDurableGlobalTarget(this)) {
        const key = registrationKey(type, options);
        const listeners = registrations.get(this)?.get(key);
        const registered = listeners?.get(listener) ?? listener;
        releaseRegistration(this, key, listener);
        return originalRemove.call(this, type, registered, options);
      }
      return originalRemove.call(this, type, listener, options);
    };
  });
}

export async function measureAttributeFeedback<Value>(
  page: Page,
  locator: Locator,
  operation: () => Promise<Value>,
  options: { attribute: string; expected: string; timeoutMs?: number }
): Promise<{ feedbackMs: number; value: Value }> {
  const key = `phase8-feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await locator.evaluate((element, input) => {
    type FeedbackOwner = Window & {
      __fluxiqPhase8Feedback?: Record<string, { completedAt: number | null; startedAt: number | null }>;
    };
    const owner = window as FeedbackOwner;
    const state = { completedAt: null as number | null, startedAt: null as number | null };
    (owner.__fluxiqPhase8Feedback ??= {})[input.key] = state;
    element.addEventListener("click", () => {
      state.startedAt = performance.now();
      let frameScheduled = false;
      const complete = () => {
        if (element.getAttribute(input.attribute) !== input.expected || state.startedAt === null) return false;
        if (frameScheduled) return true;
        frameScheduled = true;
        observer.disconnect();
        requestAnimationFrame(() => { state.completedAt = performance.now(); });
        return true;
      };
      const observer = new MutationObserver(complete);
      observer.observe(element, { attributes: true, attributeFilter: [input.attribute] });
      queueMicrotask(complete);
    }, { capture: true, once: true });
  }, { key, attribute: options.attribute, expected: options.expected });
  const value = await operation();
  await page.waitForFunction((measurementKey) => {
    const state = (window as typeof window & {
      __fluxiqPhase8Feedback?: Record<string, { completedAt: number | null; startedAt: number | null }>;
    }).__fluxiqPhase8Feedback?.[measurementKey];
    return state?.completedAt !== null && state?.startedAt !== null;
  }, key, { timeout: options.timeoutMs ?? 2_000 });
  const feedbackMs = await page.evaluate((measurementKey) => {
    const owner = window as typeof window & {
      __fluxiqPhase8Feedback?: Record<string, { completedAt: number | null; startedAt: number | null }>;
    };
    const state = owner.__fluxiqPhase8Feedback?.[measurementKey];
    if (!state || state.completedAt === null || state.startedAt === null) throw new Error("Feedback measurement did not complete.");
    delete owner.__fluxiqPhase8Feedback?.[measurementKey];
    return state.completedAt - state.startedAt;
  }, key);
  return { feedbackMs, value };
}

export async function collectPhase8BrowserResources(page: Page): Promise<Phase8BrowserResourceSnapshot> {
  return await page.evaluate(() => {
    const resources = (window as typeof window & {
      __fluxiqPhase8Resources?: { listeners: number; peakListeners: number; subscriptions: number; peakSubscriptions: number };
    }).__fluxiqPhase8Resources ?? { listeners: 0, peakListeners: 0, subscriptions: 0, peakSubscriptions: 0 };
    const namespace = "fluxiq%3Aautomation-studio%3Aui-cache";
    const entries = Object.keys(localStorage).filter((key) => key.startsWith(namespace));
    const sizes = entries.map((key) => (localStorage.getItem(key) ?? "").length);
    const projects = new Set(entries.map((key) => key.split(":")[2]).filter(Boolean));
    const totalChars = sizes.reduce((total, size) => total + size, 0);
    const largestEntryChars = Math.max(0, ...sizes);
    return {
      ...resources,
      domNodes: document.getElementsByTagName("*").length,
      warmViews: document.querySelectorAll('.automation-mounted-view:not([data-active="true"])').length,
      cache: {
        entries: entries.length,
        projects: projects.size,
        totalChars,
        largestEntryChars,
        withinBounds: largestEntryChars <= 500_000 && totalChars <= 2_000_000 && projects.size <= 20,
      },
    };
  });
}

export async function measureAnimationFrameDurations(page: Page, operation: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => {
    (window as typeof window & { __fluxiqPhase8Frames?: number[] }).__fluxiqPhase8Frames = [];
    let previous = performance.now();
    let active = true;
    const sample = (now: number) => {
      const owner = window as typeof window & { __fluxiqPhase8Frames?: number[]; __fluxiqStopPhase8Frames?: () => void };
      owner.__fluxiqPhase8Frames?.push(now - previous);
      previous = now;
      if (active) requestAnimationFrame(sample);
      owner.__fluxiqStopPhase8Frames = () => { active = false; };
    };
    requestAnimationFrame(sample);
  });
  await operation();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return await page.evaluate(() => {
    const owner = window as typeof window & { __fluxiqPhase8Frames?: number[]; __fluxiqStopPhase8Frames?: () => void };
    owner.__fluxiqStopPhase8Frames?.();
    return owner.__fluxiqPhase8Frames ?? [];
  });
}

export function phase8EnvironmentMetadata(testInfo: TestInfo) {
  const cpu = cpus()[0];
  return {
    generatedAt: new Date().toISOString(),
    project: testInfo.project.name,
    browserEngine: testInfo.project.metadata.browserEngine ?? testInfo.project.name,
    viewportProfile: testInfo.project.metadata.viewportProfile ?? "unknown",
    baseURL: testInfo.project.use.baseURL ?? process.env.FLUXIQ_E2E_BASE_URL ?? "http://127.0.0.1:3000",
    buildMode: process.env.FLUXIQ_E2E_BUILD_MODE ?? "unrecorded",
    normalized: process.env.FLUXIQ_E2E_NORMALIZED === "true",
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpu?.model ?? "unknown",
    logicalCpuCount: cpus().length,
    memoryGiB: Math.round(totalmem() / 1024 / 1024 / 1024),
    extensionsRequiredDisabled: true,
  };
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

async function readUiPerformanceCursor(page: Page): Promise<UiPerformanceCursor> {
  return await page.evaluate(() => {
    const collected = (window as typeof window & {
      __fluxiqUiPerformance?: {
        apiMetrics: unknown[];
        longTasks: unknown[];
        renderMetrics: unknown[];
      };
    }).__fluxiqUiPerformance;
    return {
      timeOrigin: performance.timeOrigin,
      apiMetricIndex: collected?.apiMetrics.length ?? 0,
      longTaskIndex: collected?.longTasks.length ?? 0,
      renderMetricIndex: collected?.renderMetrics.length ?? 0,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
}

export function countRenderCommits(metrics: ReadonlyArray<{ component: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const metric of metrics) counts[metric.component] = (counts[metric.component] ?? 0) + 1;
  return counts;
}

async function readUiPerformanceEvidence(page: Page, cursor: UiPerformanceCursor) {
  return await page.evaluate((start) => {
    const collected = (window as typeof window & {
      __fluxiqUiPerformance?: {
        apiMetrics: UiRequestPerformanceMetric[];
        longTasks: Array<{ startTime: number; duration: number }>;
        renderMetrics: Array<{ component: string; count: number; recordedAt: number }>;
      };
    }).__fluxiqUiPerformance;
    const documentChanged = performance.timeOrigin !== start.timeOrigin;
    const apiMetricIndex = documentChanged ? 0 : start.apiMetricIndex;
    const longTaskIndex = documentChanged ? 0 : start.longTaskIndex;
    const renderMetricIndex = documentChanged ? 0 : start.renderMetricIndex;
    const renderMetrics = (collected?.renderMetrics ?? []).slice(renderMetricIndex);
    const domAfter = document.getElementsByTagName("*").length;
    return {
      apiMetricCount: Math.max(0, (collected?.apiMetrics.length ?? 0) - apiMetricIndex),
      domBefore: start.domNodes,
      domAfter,
      domDelta: domAfter - start.domNodes,
      renderMetrics,
      longTaskEntries: (collected?.longTasks ?? []).slice(longTaskIndex),
    };
  }, cursor);
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
  const renders = Object.entries(metrics.renderCounts ?? {}).map(([name, count]) => name + ":" + count).join(",") || "none";
  return "duration=" + Math.round(metrics.duration) + "ms operation=" + Math.round(metrics.operationDuration) + "ms settle=" + Math.round(metrics.settleDuration) + "ms requests=" + metrics.requestCount + " apiMetrics=" + (metrics.apiMetricCount ?? 0) + " longTasks=" + metrics.longTaskCount + " domDelta=" + (metrics.domDelta ?? 0) + " renders=" + renders + " timedOut=" + metrics.timedOut + requests;
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
  const cursor = options.returnMetrics === true ? await readUiPerformanceCursor(page) : null;
  const tracker = options.waitForSettled === true || options.returnMetrics === true ? createRequestTracker(page, options) : null;
  await operation();
  const finishedAt = await page.evaluate(() => performance.now());
  const operationDuration = finishedAt - startedAt;
  if (!tracker) {
    return operationDuration;
  }
  try {
    const metrics = await waitForStudioSettledWithTracker(page, startedAt, operationDuration, tracker, options);
    if (options.returnMetrics !== true || !cursor) return metrics.duration;
    const evidence = await readUiPerformanceEvidence(page, cursor);
    return { ...metrics, ...evidence, renderCounts: countRenderCommits(evidence.renderMetrics) };
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
