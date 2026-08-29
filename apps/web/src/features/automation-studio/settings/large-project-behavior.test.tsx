import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { SettingsView, flowLimitsInterfaceErrors, saveFlowSettings } from "./index";

describe("Settings large-project behavior", () => {
  it("renders a usable empty Flow settings form", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: null }));
    expect(html).toContain("Flow Identity");
    expect(html).toContain("Save Settings");
  });

  it("validates thousands of named interface ports without expanding a collection view", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const interfaceInputs = fixture.flows.map((flow) => ({
      id: `input.${flow.flowId}`, name: flow.name, valueKind: "string" as const, required: false, description: "", defaultValue: ""
    }));
    expect(flowLimitsInterfaceErrors({
      maxInterventionsPerRun: "2", maxTokensPerRun: "12000", maxCostUsdPerTrainingWindow: "5",
      maxAdaptationInterventionsPerRun: "2", maxAdaptationCostUsdPerRun: "1", maxRetriesPerAction: "1",
      maxRecoveryAttemptsPerSubflow: "2", maxReroutesPerRun: "2", interfaceInputs, interfaceOutputs: []
    })).toEqual([]);
  });

  it("preserves authorization failures from settings persistence", async () => {
    const api = { post: vi.fn().mockResolvedValue({ ok: false, error: "flow.manage permission required" }) } as any;
    await expect(saveFlowSettings(api, { flowId: "flow.00000" })).resolves.toEqual({
      ok: false, error: "flow.manage permission required"
    });
  });
});
