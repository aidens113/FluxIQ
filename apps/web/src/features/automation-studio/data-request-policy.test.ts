import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS,
  AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS,
  assertAutomationStudioBrowserEndpointAllowed,
  automationStudioLazyPreloadPlan,
  automationStudioRequestIsOrdinary,
  automationStudioUiRequest
} from "./data-request-policy";
import { automationStudioProjectOpenRequests, automationStudioRuntimeSummaryRequests } from "./AutomationStudioLive";

describe("Automation Studio ordinary request policy", () => {
  it("rejects every known full-document endpoint from catalog and summary paths", () => {
    for (const endpoint of AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS) {
      expect(() => automationStudioUiRequest("catalog", endpoint, {})).toThrow(/full-document endpoint/);
      expect(() => automationStudioUiRequest("summary", endpoint, {})).toThrow(/full-document endpoint/);
      expect(automationStudioUiRequest("detail", endpoint, {})).toMatchObject({ endpoint, intent: "detail" });
    }
  });

  it("classifies every project-open request as an ordinary bounded request", () => {
    const requests = [
      ...automationStudioProjectOpenRequests("project.scale"),
      ...automationStudioRuntimeSummaryRequests("project.scale")
    ];
    expect(requests.every(automationStudioRequestIsOrdinary)).toBe(true);
    expect(requests.every((request) => !AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS.includes(request.endpoint as never))).toBe(true);
  });


  it("builds a tiered lazy preload plan from bounded Automation Studio endpoints", () => {
    const plan = automationStudioLazyPreloadPlan({
      projectId: "project.scale",
      activeFlowId: "flow.main",
      activeSubflowId: "subflow.worker",
      activeRunId: "run.latest",
      activeViewId: "runtime-debug",
      openViewIds: ["adaptations", "flow-settings"],
      graphViewportBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 }
    });

    expect(plan).toMatchObject({ projectId: "project.scale", maxConcurrency: 1, sliceBudgetMs: 8 });
    expect(plan.tasks.map((task) => task.tier)).toEqual([...plan.tasks.map((task) => task.tier)].sort((left, right) => left - right));
    expect(new Set(plan.tasks.map((task) => task.dedupeKey)).size).toBe(plan.tasks.length);
    expect(plan.tasks.map((task) => task.request.endpoint)).toEqual(expect.arrayContaining([
      "get-project-hierarchy",
      "get-project-workspace-summary",
      "list-flow-subflows",
      "list-flow-instructions",
      "list-flow-runs",
      "get-flow-router",
      "get-graph-viewport",
      "list-flow-adaptations",
      "get-flow-metadata-detail",
      "list-flow-run-events",
      "list-flow-run-actions"
    ]));
    expect(plan.tasks.every((task) => !AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS.includes(task.request.endpoint as never))).toBe(true);
  });

  it("caps lazy preload tiers so project open cannot queue deep background work", () => {
    const plan = automationStudioLazyPreloadPlan({ projectId: "project.scale", activeFlowId: "flow.main", activeRunId: "run.latest", openViewIds: ["adaptations"], maxTier: 1 });
    expect(plan.tasks.every((task) => task.tier <= 1)).toBe(true);
    expect(plan.tasks.map((task) => task.request.endpoint)).not.toContain("list-flow-run-events");
    expect(plan.tasks.map((task) => task.request.endpoint)).not.toContain("list-flow-adaptations");
  });
  it("does not call the Automation Studio snapshot endpoint from the live UI", () => {
    const source = readFileSync(new URL("./AutomationStudioLive.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bapi\.(?:get|post)<[^>]*>?\s*\(\s*["']snapshot["']/);
    expect(source).not.toMatch(/\bapi\.(?:get|post)\(\s*["']snapshot["']/);
  });

  it("blocks browser access to legacy broad endpoints during v2 cutover", () => {
    for (const endpoint of AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS) {
      expect(() => assertAutomationStudioBrowserEndpointAllowed(endpoint)).toThrow(/retired for v2 cutover/);
    }
    expect(() => assertAutomationStudioBrowserEndpointAllowed("get-graph-viewport")).not.toThrow();
    expect(() => assertAutomationStudioBrowserEndpointAllowed("apply-graph-patch")).not.toThrow();
    expect(() => assertAutomationStudioBrowserEndpointAllowed("list-flow-run-events")).not.toThrow();
  });
});
