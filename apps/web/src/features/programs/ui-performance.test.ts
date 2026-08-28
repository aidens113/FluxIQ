import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { automationStudioCounterKey, getAutomationStudioPerformanceCounters, recordAutomationStudioDraftWrite, recordAutomationStudioHierarchySaveRequest, recordAutomationStudioRequestLifecycle, recordAutomationStudioShellRender, recordAutomationStudioViewRender, resetAutomationStudioPerformanceCounters, subscribeAutomationStudioPerformanceCounters, uiLongTaskMetricFromEntry } from "./ui-performance";

describe("UI performance metrics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetAutomationStudioPerformanceCounters();
  });

  it("normalizes long-task entries without retaining attribution payloads", () => {
    expect(uiLongTaskMetricFromEntry("AutomationStudio", {
      name: "self",
      startTime: 12,
      duration: 75
    })).toMatchObject({
      scope: "AutomationStudio",
      name: "self",
      startTime: 12,
      duration: 75
    });
  });

  it("collects Automation Studio counters by kind and name for tests", () => {
    recordAutomationStudioShellRender();
    recordAutomationStudioShellRender();
    recordAutomationStudioViewRender("RuntimeDebug");
    recordAutomationStudioRequestLifecycle("open-runtime-debug", { phase: "loading" });
    recordAutomationStudioHierarchySaveRequest({ source: "test" });
    recordAutomationStudioDraftWrite("operation-draft", { flowId: "flow.one" });

    const snapshot = getAutomationStudioPerformanceCounters();
    expect(snapshot.counts["studio-shell-render"]).toBe(2);
    expect(snapshot.counts["view-render"]).toBe(1);
    expect(snapshot.counts["request-lifecycle"]).toBe(1);
    expect(snapshot.counts["hierarchy-save-request"]).toBe(1);
    expect(snapshot.counts["draft-write"]).toBe(1);
    expect(snapshot.byName[automationStudioCounterKey("studio-shell-render", "AutomationStudioLive")]).toBe(2);
    expect(snapshot.byName[automationStudioCounterKey("view-render", "RuntimeDebug")]).toBe(1);
    expect(snapshot.events.at(-1)).toMatchObject({ kind: "draft-write", name: "operation-draft", metadata: { flowId: "flow.one" } });
  });

  it("notifies subscribers when counters change", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeAutomationStudioPerformanceCounters(subscriber);

    recordAutomationStudioHierarchySaveRequest();
    unsubscribe();
    recordAutomationStudioHierarchySaveRequest();

    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("keeps counters inert in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");

    recordAutomationStudioShellRender();
    expect(getAutomationStudioPerformanceCounters().counts["studio-shell-render"]).toBe(0);
  });

  it("keeps render and long-task hooks opt-in for normal dev sessions", () => {
    const source = readFileSync(new URL("./ui-performance.ts", import.meta.url), "utf8");
    const renderHookStart = source.indexOf("export function useUiRenderMetric");
    const longTaskHookStart = source.indexOf("export function useUiLongTaskMetrics");
    const hookSource = source.slice(renderHookStart, source.indexOf("export function startUiLongTaskObserver"));

    expect(renderHookStart).toBeGreaterThan(-1);
    expect(longTaskHookStart).toBeGreaterThan(renderHookStart);
    expect(hookSource).toContain("if (!uiPerformanceRenderHooksEnabled()) return");
    expect(source).toContain("window.__FLUXIQ_ENABLE_UI_PERFORMANCE_COUNTERS__ === true");
  });
});


