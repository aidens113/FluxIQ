import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS,
  AUTOMATION_STUDIO_FULL_DOCUMENT_ENDPOINTS,
  assertAutomationStudioBrowserEndpointAllowed,
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
