import { expect, test, type CDPSession, type Locator, type Page, type TestInfo } from "@playwright/test";
import { authenticate, readUiFixtureManifest } from "./support/app-fixture";

test.use({ trace: "off", video: "off" });

const MAX_VISIBLE_VIEW_COMMIT_MS = 100;
const MAX_FIRST_STABLE_PAINT_MS = 300;
const MAX_WARM_STABLE_PAINT_MS = 120;
const SECURITY_PIN = process.env.FLUXIQ_E2E_SECURITY_PIN ?? "123456";
const LIVE_PROJECT_PREFIX = "Live Browser Project ";
const LIVE_SWITCH_CYCLES = Math.max(1, Number(process.env.FLUXIQ_E2E_SWITCH_CYCLES ?? "3"));
const LIVE_PROGRAM_ONLY = process.env.FLUXIQ_E2E_PROGRAM_ONLY ?? "";
const GLOBAL_PROGRAMS = [
  { id: "background-tasks", title: "Background Tasks" },
  { id: "compute-control", title: "Compute Control" },
  { id: "database-manager", title: "Database Manager" },
  { id: "deployment-sync", title: "Deployment Sync" },
  { id: "docs", title: "Docs" },
  { id: "identity-access", title: "Identity & Access" },
  { id: "production-runner", title: "Production Runner" },
  { id: "runtime", title: "Runtime" },
  { id: "secret-keys", title: "Secret Keys" }
] as const;

test("the global panel and Automation Studio remain responsive without update loops", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  test.skip(testInfo.project.name !== "desktop-chromium", "The live regression runs once in desktop Chromium.");

  const failures: string[] = [];
  const httpFailures: string[] = [];
  const responseInspections: Promise<void>[] = [];
  const durations: Record<string, number[]> = {};
  const selectionPhases: Record<string, Array<{
    inputQueueMs: number;
    selectionCommitMs: number;
    viewCommitMs: number;
    postCommitPaintMs: number;
    stablePaintMs: number;
    totalMs: number;
    browserMetrics?: Record<string, number>;
    phases: Array<{ phase: string; detail?: string; offsetMs: number }>;
  }>> = {};
  const interactionViolations: string[] = [];
  const paneTabMetrics: Array<{ durationMs: number; metrics: Record<string, number> }> = [];
  const controlMetrics: Record<string, Array<{ durationMs: number; metrics: Record<string, number> }>> = {};
  const globalControlMetrics: Record<string, Array<{ durationMs: number; metrics: Record<string, number> }>> = {};
  const globalDiagnostics: Record<string, unknown> = {};
  const manifest = await readUiFixtureManifest();

  await authenticate(page, manifest);
  observeFailures(page, failures, httpFailures, responseInspections);
  const globalPerformanceSession = await page.context().newCDPSession(page);
  await globalPerformanceSession.send("Performance.enable");
  const stopGlobalChromeTrace = process.env.FLUXIQ_E2E_CHROME_TRACE === "true"
    ? await startChromeTimelineTrace(globalPerformanceSession)
    : null;

  for (const program of GLOBAL_PROGRAMS.filter((item) => !LIVE_PROGRAM_ONLY || item.id === LIVE_PROGRAM_ONLY)) {
    const startedAt = performance.now();
    await launcherLink(page, program.title).click();
    await expect(page).toHaveURL(new RegExp(`/programs/${program.id}(?:\\?.*)?$`));
    await expect(page.getByRole("heading", { name: program.title, exact: true })).toBeVisible();
    (durations[`global:${program.id}`] ??= []).push(performance.now() - startedAt);

    const technicalMetricsBefore = await readBrowserMetrics(globalPerformanceSession);
    const technicalDuration = await measureElementReveal(
      page,
      page.getByRole("button", { name: "Technical details", exact: true }),
      ".drawer-panel[role='dialog']"
    );
    (globalControlMetrics[`${program.id}:technical-drawer`] ??= []).push({
      durationMs: technicalDuration,
      metrics: browserMetricDelta(technicalMetricsBefore, await readBrowserMetrics(globalPerformanceSession))
    });
    if (technicalDuration > MAX_FIRST_STABLE_PAINT_MS) {
      interactionViolations.push(`${program.title} technical drawer: ${technicalDuration.toFixed(1)} ms`);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator(".drawer-panel[role='dialog']")).toHaveCount(0);

    const local = await auditGlobalProgramLocalControl(page, program.id, globalPerformanceSession);
    if (local) {
      (globalControlMetrics[`${program.id}:local-control`] ??= []).push(local);
      if (local.durationMs > MAX_WARM_STABLE_PAINT_MS) {
        interactionViolations.push(`${program.title} local control: ${local.durationMs.toFixed(1)} ms`);
      }
    }
    if (program.id === "docs") {
      globalDiagnostics.docs = await page.evaluate(() => {
        const article = document.querySelector<HTMLElement>(".docs-rendered:not(iframe)");
        const explorer = document.querySelector<HTMLElement>(".docs-explorer-panel");
        const tree = document.querySelector<HTMLElement>(".docs-file-tree");
        const frame = document.querySelector<HTMLIFrameElement>(".docs-html-frame");
        const frameBody = frame?.contentDocument?.body;
        return {
          articleChildren: article?.children.length ?? 0,
          articleDescendants: article?.querySelectorAll("*").length ?? 0,
          documentDescendants: document.body.querySelectorAll("*").length,
          explorerDescendants: explorer?.querySelectorAll("*").length ?? 0,
          treeDescendants: tree?.querySelectorAll("*").length ?? 0,
          treeItems: tree?.querySelectorAll('[role="treeitem"]').length ?? 0,
          frame: Boolean(frame),
          frameBodyChildren: frameBody?.children.length ?? 0,
          frameDescendants: frameBody?.querySelectorAll("*").length ?? 0,
          frameScrollHeight: frameBody?.scrollHeight ?? 0
        };
      });
    }

    await page.getByRole("link", { name: "Global workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Programs", exact: true })).toBeVisible();
  }
  const globalChromeTrace = stopGlobalChromeTrace ? await stopGlobalChromeTrace() : null;
  await globalPerformanceSession.detach();
  if (LIVE_PROGRAM_ONLY) {
    await Promise.all(responseInspections);
    console.log("LIVE_GLOBAL_CONTROL_METRICS " + JSON.stringify(globalControlMetrics));
    console.log("LIVE_GLOBAL_DIAGNOSTICS " + JSON.stringify(globalDiagnostics));
    if (globalChromeTrace) console.log("LIVE_GLOBAL_CHROME_TRACE " + JSON.stringify(globalChromeTrace));
    expect(interactionViolations, "global program interaction budget violations").toEqual([]);
    expect(failures).toEqual([]);
    return;
  }

  const studioStartedAt = performance.now();
  await launcherLink(page, "Automation Studio").click();
  await expect(page).toHaveURL(/\/programs\/automation-studio(?:\?.*)?$/);
  await expect(page.getByText("Choose a project", { exact: true })).toBeVisible();
  (durations["global:automation-studio"] ??= []).push(performance.now() - studioStartedAt);

  await deleteMatchingProjects(page, LIVE_PROJECT_PREFIX);

  const projectName = LIVE_PROJECT_PREFIX + Date.now();
  await page.getByRole("button", { name: "Project", exact: true }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create project" });
  await projectDialog.getByLabel("Project name").fill(projectName);
  await projectDialog.getByLabel("Description").fill("Created by the live panel regression.");
  await projectDialog.getByLabel("Security PIN").fill(SECURITY_PIN);
  const projectStartedAt = performance.now();
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  const createdProject = projectRow(page, projectName);
  const projectHeading = page.locator(".automation-studio-sidebar-heading").getByText(projectName);
  await expect.poll(async () => await projectHeading.isVisible() || await createdProject.isVisible()).toBe(true);
  if (!await projectHeading.isVisible()) await createdProject.locator(".automation-project-row-main").click();
  await expect(projectHeading).toBeVisible();
  (durations.projectCreate ??= []).push(performance.now() - projectStartedAt);
  await expect(page.getByLabel("Automation Studio project tree")).toBeVisible();

  await page.getByRole("button", { name: "Add Flow" }).click();
  const flowDialog = page.getByRole("dialog");
  await flowDialog.getByRole("button", { name: /^Flow/ }).click();
  const flowName = "Live Empty Flow";
  await flowDialog.getByLabel("Name").fill(flowName);
  await flowDialog.getByLabel("Flow preset").selectOption("blank");
  await flowDialog.getByLabel("Security PIN").fill(SECURITY_PIN);
  const flowStartedAt = performance.now();
  await flowDialog.getByRole("button", { name: "Create", exact: true }).click();
  const flow = treeRow(page, flowName);
  await expect(flow).toBeVisible();
  await expect(flow).toHaveAttribute("aria-selected", "true");
  (durations.flowCreate ??= []).push(performance.now() - flowStartedAt);
  await assertHierarchyGeometry(page);
  await page.screenshot({
    path: testInfo.outputPath("automation-studio-sidebar.png"),
    animations: "disabled"
  });

  const stopCpuProfile = process.env.FLUXIQ_E2E_CPU_PROFILE === "true"
    ? await startCpuProfile(page)
    : null;
  const performanceSession = await page.context().newCDPSession(page);
  await performanceSession.send("Performance.enable");
  const layoutStyles = await page.evaluate(() => Object.fromEntries([
    ".automation-studio-shell",
    ".automation-studio-sidebar-shell",
    ".automation-mounted-view-stack",
    ".automation-mounted-view"
  ].map((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return [selector, null];
    const style = getComputedStyle(element);
    return [selector, {
      contain: style.contain,
      display: style.display,
      position: style.position,
      visibility: style.visibility,
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    }];
  })));
  const stopChromeTrace = process.env.FLUXIQ_E2E_CHROME_TRACE === "true"
    ? await startChromeTimelineTrace(performanceSession)
    : null;
  for (let cycle = 0; cycle < LIVE_SWITCH_CYCLES; cycle += 1) {
    for (const { label, viewId } of [
      { label: "Runtime Debug", viewId: "runtime-debug" },
      { label: "Instructions", viewId: "flow-instructions" },
      { label: "Settings", viewId: "flow-settings" },
      { label: "Router", viewId: "flow-router" }
    ]) {
      const metricsBefore = await readBrowserMetrics(performanceSession);
      const timing = await selectTreeRow(page, label, viewId);
      timing.browserMetrics = browserMetricDelta(metricsBefore, await readBrowserMetrics(performanceSession));
      (durations[label] ??= []).push(timing.totalMs);
      (durations[`${label} stable paint`] ??= []).push(timing.stablePaintMs);
      (selectionPhases[label] ??= []).push(timing);
      if (timing.totalMs > MAX_VISIBLE_VIEW_COMMIT_MS) {
        interactionViolations.push(`${label} cycle ${cycle + 1}: ${timing.totalMs.toFixed(1)} ms`);
      }
      const stablePaintBudget = cycle === 0 ? MAX_FIRST_STABLE_PAINT_MS : MAX_WARM_STABLE_PAINT_MS;
      if (timing.stablePaintMs > stablePaintBudget) {
        interactionViolations.push(
          `${label} stable paint cycle ${cycle + 1}: ${timing.stablePaintMs.toFixed(1)} ms`
        );
      }
    }
  }
  const chromeTrace = stopChromeTrace ? await stopChromeTrace() : null;
  const nodes = page.getByRole("tab", { name: "Nodes", exact: true });
  await nodes.click();
  await expect(nodes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Nodes whiteboard")).toBeVisible();
  const stopPaneChromeTrace = process.env.FLUXIQ_E2E_CHROME_TRACE === "true"
    ? await startChromeTimelineTrace(performanceSession)
    : null;

  const tabs = page.getByRole("tablist", { name: "Pane 1 tabs" }).getByRole("tab");
  if (await tabs.count() > 1) {
    const first = tabs.first();
    const last = tabs.last();
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const tab of [last, first]) {
        const metricsBefore = await readBrowserMetrics(performanceSession);
        const timing = await selectPaneTab(page, tab);
        paneTabMetrics.push({
          durationMs: timing,
          metrics: browserMetricDelta(metricsBefore, await readBrowserMetrics(performanceSession))
        });
        (durations["Pane tab"] ??= []).push(timing);
        if (timing > MAX_WARM_STABLE_PAINT_MS) {
          interactionViolations.push(`Pane tab cycle ${cycle + 1}: ${timing.toFixed(1)} ms`);
        }
      }
    }
  }

  const auditReveal = async (
    label: string,
    trigger: Locator,
    targetSelector: string,
    close: () => Promise<void>
  ) => {
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const metricsBefore = await readBrowserMetrics(performanceSession);
      const durationMs = await measureElementReveal(page, trigger, targetSelector);
      (controlMetrics[label] ??= []).push({
        durationMs,
        metrics: browserMetricDelta(metricsBefore, await readBrowserMetrics(performanceSession))
      });
      (durations[label] ??= []).push(durationMs);
      const budget = cycle === 0 ? MAX_FIRST_STABLE_PAINT_MS : MAX_WARM_STABLE_PAINT_MS;
      if (durationMs > budget) {
        interactionViolations.push(`${label} cycle ${cycle + 1}: ${durationMs.toFixed(1)} ms`);
      }
      await close();
    }
  };

  const flowActions = page.getByRole("button", { name: `${flowName} actions`, exact: true });
  if (await flowActions.count()) {
    await auditReveal(
      "Flow action menu",
      flowActions,
      ".menu-popover-portal[role='menu']",
      async () => { await page.keyboard.press("Escape"); }
    );
  }
  await auditReveal(
    "Arrange workspace",
    page.getByRole("button", { name: "Arrange Main", exact: true }),
    ".automation-layout-picker-panel",
    async () => { await page.keyboard.press("Escape"); }
  );
  await auditReveal(
    "Add workspace tab",
    page.getByRole("button", { name: "Add tab", exact: true }).first(),
    ".automation-window-adder-panel",
    async () => { await page.keyboard.press("Escape"); }
  );
  await auditReveal(
    "Find open tab",
    page.getByRole("button", { name: "Find open tab", exact: true }).first(),
    ".automation-tab-picker",
    async () => {
      await page.getByRole("button", { name: "Find open tab", exact: true }).first().click();
    }
  );
  const paneChromeTrace = stopPaneChromeTrace ? await stopPaneChromeTrace() : null;
  await performanceSession.detach();
  const cpuProfile = stopCpuProfile ? await stopCpuProfile() : [];

  await returnToProjectBrowser(page);
  await deleteMatchingProjects(page, projectName);
  await page.waitForTimeout(250);
  await Promise.all(responseInspections);

  const updateFailures = failures.filter((message) => (
    /maximum update depth|too many re-renders|infinite update loop/i.test(message)
  ));
  testInfo.annotations.push({ type: "interaction-durations", description: JSON.stringify(durations) });
  console.log("LIVE_INTERACTION_DURATIONS " + JSON.stringify(durations));
  console.log("LIVE_SELECTION_PHASES " + JSON.stringify(selectionPhases));
  console.log("LIVE_PANE_TAB_METRICS " + JSON.stringify(paneTabMetrics));
  console.log("LIVE_CONTROL_METRICS " + JSON.stringify(controlMetrics));
  console.log("LIVE_GLOBAL_CONTROL_METRICS " + JSON.stringify(globalControlMetrics));
  console.log("LIVE_GLOBAL_DIAGNOSTICS " + JSON.stringify(globalDiagnostics));
  console.log("LIVE_LAYOUT_STYLES " + JSON.stringify(layoutStyles));
  if (cpuProfile.length) console.log("LIVE_CPU_PROFILE " + JSON.stringify(cpuProfile));
  if (chromeTrace) console.log("LIVE_CHROME_TRACE " + JSON.stringify(chromeTrace));
  if (paneChromeTrace) console.log("LIVE_PANE_CHROME_TRACE " + JSON.stringify(paneChromeTrace));
  expect(interactionViolations, "visible Flow view commit budget violations").toEqual([]);
  expect(updateFailures).toEqual([]);
  expect(httpFailures).toEqual([]);
  expect(failures).toEqual([]);
});

function observeFailures(
  page: Page,
  failures: string[],
  httpFailures: string[],
  responseInspections: Promise<void>[]
) {
  page.on("pageerror", (error) => failures.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    failures.push("console: " + message.text() + (location.url ? " @ " + location.url : ""));
  });
  page.on("response", (response) => {
    if (response.status() < 400 || !response.url().includes("/api/")) return;
    responseInspections.push((async () => {
      const request = response.request();
      const responseBody = await response.text().catch(() => "");
      httpFailures.push(
        response.status() + " " + request.method() + " " + response.url()
        + " request=" + (request.postData() ?? "")
        + " response=" + responseBody
      );
    })());
  });
}

async function auditGlobalProgramLocalControl(
  page: Page,
  programId: typeof GLOBAL_PROGRAMS[number]["id"],
  session: CDPSession
): Promise<{ durationMs: number; metrics: Record<string, number> } | null> {
  let control: Locator | null = null;
  let eventName: "click" | "input" = "click";
  let action: (() => Promise<void>) | null = null;

  if (programId === "background-tasks") control = page.getByRole("searchbox", { name: "Search tasks" });
  else if (programId === "compute-control") control = page.getByRole("searchbox", { name: "Search compute nodes" });
  else if (programId === "database-manager") {
    const search = page.getByRole("searchbox", { name: "Search rows" });
    control = await search.isEnabled().catch(() => false) ? search : page.getByLabel("Columns", { exact: true });
  } else if (programId === "deployment-sync") {
    control = page.getByRole("button", { name: "actions", exact: true });
  } else if (programId === "docs") control = page.getByRole("searchbox", { name: "Search documentation" });
  else if (programId === "identity-access") {
    control = page.getByRole("button", { name: "Roles", exact: true });
  } else if (programId === "production-runner") {
    control = page.getByRole("button", { name: "Logs", exact: true });
  } else if (programId === "secret-keys") control = page.getByRole("searchbox", { name: "Search secret keys" });
  else return null;

  await expect(control).toBeVisible();
  if (await control.getAttribute("type") === "search" || await control.evaluate((element) => element.tagName === "INPUT")) {
    eventName = "input";
    action = async () => { await control!.fill("__fluxiq_performance_probe__"); };
  } else {
    action = async () => { await control!.click(); };
  }
  const before = await readBrowserMetrics(session);
  const durationMs = await measureControlPaint(page, control, eventName, action);
  const result = { durationMs, metrics: browserMetricDelta(before, await readBrowserMetrics(session)) };

  if (eventName === "input") await control.fill("");
  else if (programId === "identity-access") await page.getByRole("button", { name: "Users", exact: true }).click();
  else if (programId === "production-runner") await page.getByRole("button", { name: "Workloads", exact: true }).click();
  else if (programId === "deployment-sync") await page.getByRole("button", { name: "versions", exact: true }).click();
  return result;
}

async function measureControlPaint(
  page: Page,
  trigger: Locator,
  eventName: "click" | "input",
  action: () => Promise<void>
): Promise<number> {
  const marker = `control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await trigger.evaluate((element, value) => element.setAttribute("data-fluxiq-performance-trigger", value), marker);
  await page.evaluate(({ eventName, marker }) => {
    const state = window as typeof window & { __FLUXIQ_CONTROL_TIMING__?: Promise<number> };
    state.__FLUXIQ_CONTROL_TIMING__ = new Promise((resolve, reject) => {
      const selector = `[data-fluxiq-performance-trigger="${CSS.escape(marker)}"]`;
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Control event ${eventName} was not observed.`));
      }, 10_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        document.removeEventListener(eventName, handle, true);
      };
      const handle = (event: Event) => {
        if (!(event.target as Element | null)?.closest(selector)) return;
        const eventTime = event.timeStamp;
        cleanup();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve(Math.max(0, performance.now() - eventTime));
        }));
      };
      document.addEventListener(eventName, handle, true);
    });
  }, { eventName, marker });
  await action();
  try {
    return await page.evaluate(async () => {
      const state = window as typeof window & { __FLUXIQ_CONTROL_TIMING__?: Promise<number> };
      if (!state.__FLUXIQ_CONTROL_TIMING__) throw new Error("Control timing was not armed.");
      return state.__FLUXIQ_CONTROL_TIMING__;
    });
  } finally {
    await trigger.evaluate((element) => element.removeAttribute("data-fluxiq-performance-trigger")).catch(() => undefined);
  }
}

async function measureElementReveal(page: Page, trigger: Locator, targetSelector: string): Promise<number> {
  const marker = `interaction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await trigger.evaluate((element, value) => element.setAttribute("data-fluxiq-performance-trigger", value), marker);
  await page.evaluate(({ marker, targetSelector }) => {
    const state = window as typeof window & { __FLUXIQ_REVEAL_TIMING__?: Promise<number> };
    state.__FLUXIQ_REVEAL_TIMING__ = new Promise((resolve, reject) => {
      let eventTime = 0;
      let settling = false;
      const triggerSelector = `[data-fluxiq-performance-trigger="${CSS.escape(marker)}"]`;
      const cleanup = () => {
        observer.disconnect();
        document.removeEventListener("pointerdown", onPointerDown, true);
        window.clearTimeout(timeout);
      };
      const inspect = () => {
        if (!eventTime || settling) return;
        const target = document.querySelector<HTMLElement>(targetSelector);
        if (!target || target.hidden || target.getAttribute("aria-hidden") === "true") return;
        const style = getComputedStyle(target);
        const bounds = target.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || bounds.width <= 0 || bounds.height <= 0) return;
        settling = true;
        cleanup();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve(Math.max(0, performance.now() - eventTime));
        }));
      };
      const observer = new MutationObserver(inspect);
      const onPointerDown = (event: PointerEvent) => {
        if (!(event.target as Element | null)?.closest(triggerSelector)) return;
        eventTime = event.timeStamp;
        inspect();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Interaction target ${targetSelector} did not become visible.`));
      }, 10_000);
      document.addEventListener("pointerdown", onPointerDown, true);
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["aria-hidden", "class", "hidden", "style"],
        childList: true,
        subtree: true
      });
    });
  }, { marker, targetSelector });
  await trigger.click();
  try {
    return await page.evaluate(async () => {
      const state = window as typeof window & { __FLUXIQ_REVEAL_TIMING__?: Promise<number> };
      if (!state.__FLUXIQ_REVEAL_TIMING__) throw new Error("Reveal timing was not armed.");
      return state.__FLUXIQ_REVEAL_TIMING__;
    });
  } finally {
    await trigger.evaluate((element) => element.removeAttribute("data-fluxiq-performance-trigger")).catch(() => undefined);
  }
}

async function selectPaneTab(page: Page, tab: Locator): Promise<number> {
  const target = await tab.evaluate((element) => {
    const container = element.closest<HTMLElement>("[data-automation-window-id]");
    const windowId = container?.dataset.automationWindowId;
    if (!container || !windowId || !element.id) throw new Error("Pane tab is missing its window identity.");
    const prefix = `automation-tab-${windowId}-`;
    if (!element.id.startsWith(prefix)) throw new Error(`Unexpected pane tab id: ${element.id}`);
    return { viewId: element.id.slice(prefix.length), windowId };
  });
  await page.evaluate(({ viewId, windowId }) => {
    const state = window as typeof window & { __FLUXIQ_TAB_COMMIT__?: Promise<number> };
    state.__FLUXIQ_TAB_COMMIT__ = new Promise((resolve, reject) => {
      let eventTime = 0;
      let settling = false;
      const container = document.querySelector<HTMLElement>(`[data-automation-window-id="${CSS.escape(windowId)}"]`);
      if (!container) return reject(new Error(`Pane ${windowId} was not found.`));
      const tab = container.querySelector<HTMLElement>(`#${CSS.escape(`automation-tab-${windowId}-${viewId}`)}`);
      if (!tab) return reject(new Error(`Pane tab ${viewId} was not found.`));
      const inspect = () => {
        if (!eventTime || settling) return;
        const view = container.querySelector<HTMLElement>(`.automation-mounted-view[data-view-id="${CSS.escape(viewId)}"]`);
        if (!view || view.hidden || view.getAttribute("aria-hidden") === "true") return;
        settling = true;
        cleanup();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (tab.getAttribute("aria-selected") !== "true") {
            reject(new Error(`Pane tab ${viewId} was not selected after activation.`));
            return;
          }
          resolve(Math.max(0, performance.now() - eventTime));
        }));
      };
      const observer = new MutationObserver(inspect);
      const onPointerDown = (event: PointerEvent) => {
        if (!(event.target as Element | null)?.closest(`#${CSS.escape(`automation-tab-${windowId}-${viewId}`)}`)) return;
        eventTime = event.timeStamp;
        inspect();
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Pane view ${viewId} did not become visible.`));
      }, 10_000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        observer.disconnect();
        document.removeEventListener("pointerdown", onPointerDown, true);
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      observer.observe(container, {
        attributes: true,
        attributeFilter: ["aria-hidden", "hidden"],
        childList: true,
        subtree: true
      });
    });
  }, target);
  await tab.click();
  return page.evaluate(async () => {
    const state = window as typeof window & { __FLUXIQ_TAB_COMMIT__?: Promise<number> };
    if (!state.__FLUXIQ_TAB_COMMIT__) throw new Error("Pane tab timing was not armed.");
    return state.__FLUXIQ_TAB_COMMIT__;
  });
}

async function assertHierarchyGeometry(page: Page): Promise<void> {
  await expect(page.getByRole("separator", { name: "Resize hierarchy", exact: true })).toHaveCount(1);
  await expect(page.getByRole("separator", { name: "Resize project hierarchy", exact: true })).toHaveCount(0);
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".automation-studio-shell");
    const region = document.querySelector<HTMLElement>(".automation-studio-sidebar-shell");
    const sidebar = region?.querySelector<HTMLElement>(".automation-studio-sidebar");
    const tree = region?.querySelector<HTMLElement>(".automation-project-tree");
    const resize = region?.querySelector<HTMLElement>(".automation-section-resize-handle.hierarchy");
    if (!shell || !region || !sidebar || !tree || !resize) {
      throw new Error("Hierarchy geometry elements are missing.");
    }
    const box = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    return {
      shell: box(shell),
      region: box(region),
      sidebar: box(sidebar),
      tree: box(tree),
      resize: box(resize),
      resizeOpacity: getComputedStyle(resize).opacity
    };
  });
  expect(Math.abs(geometry.shell.height - geometry.region.height), "hierarchy region fills shell").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.region.height - geometry.sidebar.height), "sidebar fills hierarchy region").toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.region.height - geometry.resize.height), "resize target fills hierarchy region").toBeLessThanOrEqual(1);
  expect(geometry.tree.height, "tree owns remaining vertical space").toBeGreaterThan(100);
  expect(geometry.resize.width).toBe(8);
  expect(geometry.resizeOpacity).toBe("0");
}

async function startCpuProfile(page: Page): Promise<() => Promise<Array<{
  functionName: string;
  url: string;
  line: number;
  selfMs: number;
}>>> {
  const session = await page.context().newCDPSession(page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 100 });
  await session.send("Profiler.start");
  return async () => {
    const result = await session.send("Profiler.stop") as { profile: {
      nodes: Array<{
        id: number;
        callFrame: { functionName: string; url: string; lineNumber: number };
      }>;
      samples?: number[];
      timeDeltas?: number[];
    } };
    await session.detach();
    const byId = new Map(result.profile.nodes.map((node) => [node.id, node]));
    const totals = new Map<string, { functionName: string; url: string; line: number; selfMs: number }>();
    for (let index = 0; index < (result.profile.samples?.length ?? 0); index += 1) {
      const node = byId.get(result.profile.samples?.[index] ?? -1);
      if (!node) continue;
      const frame = node.callFrame;
      const functionName = frame.functionName || "(anonymous)";
      const key = `${functionName}\u0000${frame.url}\u0000${frame.lineNumber}`;
      const current = totals.get(key) ?? {
        functionName,
        url: frame.url,
        line: frame.lineNumber + 1,
        selfMs: 0
      };
      current.selfMs += (result.profile.timeDeltas?.[index] ?? 0) / 1_000;
      totals.set(key, current);
    }
    return [...totals.values()]
      .sort((left, right) => right.selfMs - left.selfMs)
      .slice(0, 30)
      .map((entry) => ({ ...entry, selfMs: Math.round(entry.selfMs * 10) / 10 }));
  };
}

const BROWSER_METRIC_NAMES = new Set([
  "TaskDuration",
  "ScriptDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
  "LayoutCount",
  "RecalcStyleCount",
  "Nodes",
  "JSHeapUsedSize"
]);

async function readBrowserMetrics(session: CDPSession): Promise<Record<string, number>> {
  const result = await session.send("Performance.getMetrics") as {
    metrics: Array<{ name: string; value: number }>;
  };
  return Object.fromEntries(result.metrics
    .filter((metric) => BROWSER_METRIC_NAMES.has(metric.name))
    .map((metric) => [metric.name, metric.value]));
}

function browserMetricDelta(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(Object.entries(after).map(([name, value]) => {
    const delta = value - (before[name] ?? value);
    const scaled = name.endsWith("Duration") ? delta * 1_000 : delta;
    return [name, Math.round(scaled * 10) / 10];
  }));
}

async function startChromeTimelineTrace(session: CDPSession): Promise<() => Promise<{
  topEvents: Array<{ name: string; count: number; totalMs: number; maxMs: number }>;
  layouts: Array<{ durationMs: number; args: unknown }>;
  layoutInvalidations: Array<{
    name: string;
    nodeName?: string;
    reason?: string;
    functionName?: string;
    url?: string;
    lineNumber?: number;
  }>;
}>> {
  await session.send("Tracing.start", {
    categories: [
      "devtools.timeline",
      "disabled-by-default-devtools.timeline",
      "disabled-by-default-devtools.timeline.frame",
      "disabled-by-default-devtools.timeline.invalidationTracking",
      "blink.user_timing"
    ].join(","),
    transferMode: "ReturnAsStream"
  });
  return async () => {
    const completed = new Promise<string>((resolve, reject) => {
      session.once("Tracing.tracingComplete", (event: { stream?: string }) => {
        if (event.stream) resolve(event.stream);
        else reject(new Error("Chromium trace completed without a stream."));
      });
    });
    await session.send("Tracing.end");
    const stream = await completed;
    let json = "";
    for (;;) {
      const chunk = await session.send("IO.read", { handle: stream }) as { data: string; eof?: boolean };
      json += chunk.data;
      if (chunk.eof) break;
    }
    await session.send("IO.close", { handle: stream });
    const parsed = JSON.parse(json) as {
      traceEvents: Array<{
        ph: string;
        name: string;
        pid: number;
        tid: number;
        dur?: number;
        args?: unknown;
      }>;
    };
    const rendererThreads = new Set(parsed.traceEvents
      .filter((event) => event.ph === "M"
        && event.name === "thread_name"
        && (event.args as { name?: string } | undefined)?.name === "CrRendererMain")
      .map((event) => `${event.pid}:${event.tid}`));
    const durations = new Map<string, { name: string; count: number; totalMs: number; maxMs: number }>();
    const layouts: Array<{ durationMs: number; args: unknown }> = [];
    const layoutInvalidations: Array<{
      name: string;
      nodeName?: string;
      reason?: string;
      functionName?: string;
      url?: string;
      lineNumber?: number;
    }> = [];
    for (const event of parsed.traceEvents) {
      if (/LayoutInvalidationTracking/u.test(event.name) && layoutInvalidations.length < 80) {
        const data = (event.args as {
          data?: {
            nodeName?: string;
            reason?: string;
            stackTrace?: Array<{
              functionName?: string;
              url?: string;
              lineNumber?: number;
            }>;
          };
        } | undefined)?.data;
        const frame = data?.stackTrace?.[0];
        layoutInvalidations.push({
          name: event.name,
          ...(data?.nodeName ? { nodeName: data.nodeName } : {}),
          ...(data?.reason ? { reason: data.reason } : {}),
          ...(frame?.functionName ? { functionName: frame.functionName } : {}),
          ...(frame?.url ? { url: frame.url } : {}),
          ...(frame?.lineNumber !== undefined ? { lineNumber: frame.lineNumber } : {})
        });
      }
      if (event.ph !== "X" || !event.dur || !rendererThreads.has(`${event.pid}:${event.tid}`)) continue;
      const durationMs = event.dur / 1_000;
      const current = durations.get(event.name) ?? { name: event.name, count: 0, totalMs: 0, maxMs: 0 };
      current.count += 1;
      current.totalMs += durationMs;
      current.maxMs = Math.max(current.maxMs, durationMs);
      durations.set(event.name, current);
      if (event.name === "Layout") layouts.push({ durationMs, args: event.args });
    }
    const rounded = (value: number) => Math.round(value * 10) / 10;
    return {
      topEvents: [...durations.values()]
        .sort((left, right) => right.totalMs - left.totalMs)
        .slice(0, 25)
        .map((entry) => ({
          ...entry,
          totalMs: rounded(entry.totalMs),
          maxMs: rounded(entry.maxMs)
        })),
      layouts: layouts
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 12)
        .map((entry) => ({ ...entry, durationMs: rounded(entry.durationMs) })),
      layoutInvalidations
    };
  };
}

function launcherLink(page: Page, title: string) {
  return page.getByRole("link", { name: new RegExp(`^${escapeRegExp(title)}(?:\\s|$)`) }).first();
}

async function selectTreeRow(page: Page, label: string, viewId: string): Promise<{
  inputQueueMs: number;
  selectionCommitMs: number;
  viewCommitMs: number;
  postCommitPaintMs: number;
  stablePaintMs: number;
  totalMs: number;
  browserMetrics?: Record<string, number>;
  phases: Array<{ phase: string; detail?: string; offsetMs: number }>;
}> {
  const row = treeRow(page, label);
  await row.scrollIntoViewIfNeeded();
  const bounds = await row.boundingBox();
  expect(bounds, `${label} tree row bounds`).not.toBeNull();
  const treeItemId = await row.getAttribute("data-tree-item-id");
  expect(treeItemId, `${label} tree row id`).toBeTruthy();
  await page.evaluate(({ targetId, viewId }) => {
    const target = window as typeof window & {
      __FLUXIQ_SELECTION_TIMING__?: Promise<{
        inputQueueMs: number;
        selectionCommitMs: number;
        viewCommitMs: number;
        postCommitPaintMs: number;
        stablePaintMs: number;
        totalMs: number;
        browserMetrics?: Record<string, number>;
        phases: Array<{ phase: string; detail?: string; offsetMs: number }>;
      }>;
      __FLUXIQ_AUTOMATION_INTERACTION_TRACE__?: Array<{ at: number; phase: string; detail?: string }>;
    };
    target.__FLUXIQ_AUTOMATION_INTERACTION_TRACE__ = [];
    target.__FLUXIQ_SELECTION_TIMING__ = new Promise((resolve, reject) => {
      let eventTime = 0;
      let handledAt = 0;
      let selectionCommittedAt = 0;
      let viewCommittedAt = 0;
      let finished = false;
      let settling = false;
      const row = document.querySelector<HTMLElement>(`[data-tree-item-id="${CSS.escape(targetId)}"]`);
      if (!row) throw new Error(`Tree row ${targetId} was not found.`);
      const observer = new MutationObserver(() => inspect());
      const recordNativePhase = (phase: string) => (event: Event) => {
        if (!(event.target as Element | null)?.closest(`[data-tree-item-id="${CSS.escape(targetId)}"]`)) return;
        target.__FLUXIQ_AUTOMATION_INTERACTION_TRACE__?.push({ at: performance.now(), phase });
      };
      const onMouseDown = recordNativePhase("native.mousedown");
      const onPointerUp = recordNativePhase("native.pointerup");
      const onMouseUp = recordNativePhase("native.mouseup");
      const onClick = recordNativePhase("native.click");
      const onPointerDown = (event: PointerEvent) => {
        if (!(event.target as Element | null)?.closest(`[data-tree-item-id="${CSS.escape(targetId)}"]`)) return;
        eventTime = event.timeStamp;
        handledAt = performance.now();
        inspect();
      };
      const cleanup = () => {
        observer.disconnect();
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("mousedown", onMouseDown, true);
        document.removeEventListener("pointerup", onPointerUp, true);
        document.removeEventListener("mouseup", onMouseUp, true);
        document.removeEventListener("click", onClick, true);
      };
      const inspect = () => {
        if (!eventTime || finished || settling) return;
        if (!selectionCommittedAt && row.getAttribute("aria-selected") === "true") {
          selectionCommittedAt = performance.now();
        }
        const view = document.querySelector<HTMLElement>(`.automation-mounted-view[data-view-id="${CSS.escape(viewId)}"]`);
        if (!view || view.hidden || view.getAttribute("aria-hidden") === "true") return;
        viewCommittedAt ||= performance.now();
        settling = true;
        cleanup();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (row.getAttribute("aria-selected") !== "true") {
            reject(new Error(`Tree row ${targetId} was not selected after activation.`));
            return;
          }
          const stablePaintAt = performance.now();
          finished = true;
          window.clearTimeout(timeout);
          resolve({
            inputQueueMs: Math.max(0, handledAt - eventTime),
            selectionCommitMs: Math.max(0, (selectionCommittedAt || viewCommittedAt) - handledAt),
            viewCommitMs: Math.max(0, viewCommittedAt - handledAt),
            postCommitPaintMs: Math.max(0, stablePaintAt - viewCommittedAt),
            stablePaintMs: Math.max(0, stablePaintAt - eventTime),
            totalMs: Math.max(0, viewCommittedAt - eventTime),
            phases: (target.__FLUXIQ_AUTOMATION_INTERACTION_TRACE__ ?? []).map((entry) => ({
              phase: entry.phase,
              ...(entry.detail ? { detail: entry.detail } : {}),
              offsetMs: Math.max(0, entry.at - handledAt)
            }))
          });
        }));
      };
      const timeout = window.setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error(`View ${viewId} did not become visible after selecting ${targetId}.`));
      }, 10_000);
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("mouseup", onMouseUp, true);
      document.addEventListener("click", onClick, true);
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["aria-hidden", "aria-selected", "class", "hidden"],
        childList: true,
        subtree: true
      });
    });
  }, { targetId: treeItemId!, viewId });
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  return page.evaluate(async () => {
    const target = window as typeof window & {
      __FLUXIQ_SELECTION_TIMING__?: Promise<{
        inputQueueMs: number;
        selectionCommitMs: number;
        viewCommitMs: number;
        postCommitPaintMs: number;
        stablePaintMs: number;
        totalMs: number;
        phases: Array<{ phase: string; detail?: string; offsetMs: number }>;
      }>;
    };
    if (!target.__FLUXIQ_SELECTION_TIMING__) throw new Error("Selection timing was not armed.");
    return target.__FLUXIQ_SELECTION_TIMING__;
  });
}

async function returnToProjectBrowser(page: Page) {
  const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
  if (await collapse.isVisible()) await collapse.click();
  await page.getByRole("button", { name: "Back to projects", exact: true }).click();
  await expect(page.getByText("Choose a project", { exact: true })).toBeVisible();
}

async function deleteMatchingProjects(page: Page, query: string) {
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await expect(page.getByText("Loading projects", { exact: true })).toBeHidden();
  await search.fill(query);

  for (let deleted = 0; deleted < 50; deleted += 1) {
    const row = page.locator(".automation-project-row").first();
    if (await row.count() === 0) break;
    const name = (await row.locator("strong").textContent())?.trim();
    if (!name) throw new Error("A matching project row had no name.");
    const exactRow = projectRow(page, name);

    await row.getByRole("button", { name: `${name} actions`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete project", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete project" });
    await dialog.getByLabel("Security PIN").fill(SECURITY_PIN);
    await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(exactRow).toHaveCount(0);
  }

  await search.fill("");
}

function projectRow(page: Page, name: string) {
  return page.locator(".automation-project-row").filter({
    has: page.locator("strong").filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) })
  });
}

function treeRow(page: Page, label: string) {
  return page.locator(".tree-row-main").filter({ hasText: new RegExp("^" + escapeRegExp(label)) }).first();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
}
