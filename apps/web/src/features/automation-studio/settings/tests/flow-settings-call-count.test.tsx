// Flow Settings no longer offers a call limit. Runs iterate within Core's cost,
// token, deadline and no-progress guards, a diagnosis is always one call, and
// no run reads the Flow's saved `maxCalls`. Core's `update-flow-settings` still
// requires one and replaces the stored execution settings wholesale, so a save
// must carry the stored count forward: never a number the user did not choose,
// and never a dropped field that Core would reject.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import * as settings from "../index";
import { FLOW_LLM_EXECUTION_DEFAULTS, FLOW_SETTINGS_DEFAULT_VALUES, FlowSettingsViewContent, buildFlowSettingsSavePayload, flowLlmSettingsErrors, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail, type FlowSettingsDraft } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tokenLimits = { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 };
const flowWithExecution = (execution: Record<string, unknown> | undefined): any => ({
  flowId: "flow.stored",
  name: "Stored",
  source: { mode: "visual" },
  interface: { inputs: [], outputs: [] },
  metadata: { llmProvider: "deepseek", llmModel: "deepseek-flash", llmSecretKeyId: "key.deepseek", ...(execution ? { llmExecutionSettings: execution } : {}) }
});
const savedExecution = (flow: any, draftPatch: Record<string, unknown> = {}) => buildFlowSettingsSavePayload(flow, { ...flowSettingsDraftFromFlow(flow), ...draftPatch } as FlowSettingsDraft).metadata.llmExecutionSettings;

function textOf(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.children ? textOf(node.children) : "";
}

describe("Flow Settings without a call limit", () => {
  it("has no call-count field, default, bound or validation", () => {
    expect(Object.keys(settings)).not.toContain("FLOW_LLM_MAX_CALLS");
    expect(FLOW_LLM_EXECUTION_DEFAULTS).not.toHaveProperty("maxCalls");
    expect(FLOW_SETTINGS_DEFAULT_VALUES).not.toHaveProperty("llmMaxCalls");
    const draft = flowSettingsDraftFromFlow(flowWithExecution({ tokenLimits, maxCalls: 26, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 }));
    expect(draft).not.toHaveProperty("llmMaxCalls");
    // A stored count above the old ceiling of 8 no longer blocks saving the Flow.
    expect(flowLlmSettingsErrors(draft, [{ id: "key.deepseek" }], true)).toEqual([]);
  });

  it("saves the Flow's stored call count unchanged, whatever else the user edits", () => {
    for (const stored of [1, 2, 8, 26, 64]) {
      const flow = flowWithExecution({ tokenLimits, maxCalls: stored, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 });
      expect(savedExecution(flow, { llmTimeoutSeconds: "15", llmMaxTotalTokens: "12000" }), `stored ${stored}`).toEqual({ tokenLimits: { ...tokenLimits, maxTotalTokens: 12000 }, maxCalls: stored, timeoutMs: 15000, maxEstimatedCostUsd: 0.25, retryCount: 0 });
    }
    // A stray draft value cannot become the saved count: the form has no such field.
    const flow = flowWithExecution({ tokenLimits, maxCalls: 26, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 });
    expect(savedExecution(flow, { llmMaxCalls: "3" }).maxCalls).toBe(26);
  });

  it("writes the count this form always wrote only when the Flow has none Core would accept", () => {
    // Core's update-flow-settings rejects execution settings without a whole-number count.
    expect(savedExecution(flowWithExecution(undefined)).maxCalls).toBe(1);
    expect(savedExecution(flowWithExecution({ tokenLimits, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 })).maxCalls).toBe(1);
    for (const unreadable of [0, -1, 2.5, "4", null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(savedExecution(flowWithExecution({ tokenLimits, maxCalls: unreadable, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 })).maxCalls, String(unreadable)).toBe(1);
    }
  });

  it("carries a stored count through the loaded settings detail the view saves from", () => {
    const loaded = flowSettingsFlowFromDetail(
      { flowId: "flow.stored", name: "", metadata: { summaryOnly: true }, source: { mode: "visual" } },
      { flowId: "flow.stored", name: "Stored", updatedAt: 7, settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.deepseek", execution: { tokenLimits, maxCalls: 26, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } }, inputs: [], outputs: [] }
    );
    expect(savedExecution(loaded).maxCalls).toBe(26);
  });

  it("renders no call-count control and saves the stored count through the real form", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    const detail = {
      flowId: "flow.stored",
      name: "Stored",
      updatedAt: 7,
      settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.deepseek", execution: { tokenLimits, maxCalls: 26, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } },
      inputs: [],
      outputs: []
    };
    const commands = {
      loadFlow: vi.fn(async () => ({ ok: true, payload: { flow: detail } })),
      listLlmSecrets: vi.fn(async () => ({ ok: true, payload: { keys: [{ id: "key.deepseek", name: "DeepSeek key", kind: "llm", enabled: true, provider: "DeepSeek", scope: "global" }] } })),
      listPublications: vi.fn(async () => ({ ok: true, payload: { publications: [] } })),
      saveFlow: vi.fn(async () => ({ ok: true, payload: { flow: detail } }))
    };
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = create(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.stored", name: "Stored", updatedAt: 7, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />);
      });
      const labelled = (name: string) => renderer.root.findAll((node) => typeof node.type === "string" && node.props["aria-label"] === name);
      expect(labelled("Timeout (seconds)")).toHaveLength(1);
      expect(labelled("Max calls")).toHaveLength(0);
      const rendered = textOf(renderer.toJSON());
      expect(rendered).not.toMatch(/max calls|call limit|diagnosis-only|diagnose-and-adapt|up to 8/iu);

      await act(async () => labelled("Timeout (seconds)")[0]!.props.onChange({ target: { value: "15" } }));
      const buttonNamed = (name: string) => renderer.root.findAll((node) => node.type === "button" && textOf(node) === name);
      expect(buttonNamed("Save Settings")).toHaveLength(1);
      expect(buttonNamed("Save Settings")[0]!.props.disabled).toBe(false);
      await act(async () => buttonNamed("Save Settings")[0]!.props.onClick());
      expect(textOf(renderer.toJSON())).not.toContain("Fix the highlighted settings before saving.");
      const pin = renderer.root.findAll((node) => node.type === "input" && node.props.type === "password");
      expect(pin).toHaveLength(1);
      await act(async () => pin[0]!.props.onChange({ target: { value: "1234" } }));
      await act(async () => buttonNamed("Authorize and Save")[0]!.props.onClick());

      expect(commands.saveFlow).toHaveBeenCalledTimes(1);
      const request = (commands.saveFlow.mock.calls[0] as any[])[0];
      expect(request).toMatchObject({ projectId: "project.one", flowId: "flow.stored", authorizationPin: "1234" });
      expect(request.flow.metadata.llmExecutionSettings).toEqual({ tokenLimits, maxCalls: 26, timeoutMs: 15000, maxEstimatedCostUsd: 0.25, retryCount: 0 });
    } finally {
      await act(async () => { renderer?.unmount(); });
      if (previousWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = previousWindow;
    }
  });
});
