// Covers the "Maximum nodes per Subflow" Flow setting: max-nodes-setting.ts
// (the mirror of Core's constant), its draft, errors and save payload in
// flow-settings-model.ts, and its control in FlowSettingsView.tsx.

import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { FLOW_SIZE_SETTING, FlowSettingsViewContent, buildFlowSettingsSavePayload, flowLimitsInterfaceErrors, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail, type FlowSettingsDraft } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flowOf = (metadata: Record<string, unknown> = {}): any => ({
  flowId: "flow.one",
  name: "Flow",
  updatedAt: 7,
  source: { mode: "visual" },
  executionDefaults: {},
  interface: { inputs: [], outputs: [] },
  metadata
});

const RANGE_ERROR = "Maximum nodes per Subflow must be a whole number from 1 to 1,000.";

function textOf(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.children ? textOf(node.children) : "";
}

describe("the Flow size setting mirror", () => {
  it("matches Core's setting", () => {
    const core = readFileSync(new URL("../../../../../../../packages/fluxiq/src/programs/automation-studio/model/flow-size/flow-size-settings.ts", import.meta.url), "utf8");
    const field = (name: string) => {
      const found = core.match(new RegExp(`\\b${name}:\\s*("[^"]*"|[0-9_]+)`));
      expect(found, `Core no longer states ${name}; re-read flow-size-settings.ts`).toBeTruthy();
      const raw = found![1]!;
      return raw.startsWith("\"") ? raw.slice(1, -1) : Number(raw.replace(/_/g, ""));
    };
    expect(field("metadataKey")).toBe(FLOW_SIZE_SETTING.metadataKey);
    expect(field("field")).toBe(FLOW_SIZE_SETTING.field);
    expect(field("defaultValue")).toBe(FLOW_SIZE_SETTING.defaultValue);
    expect(field("minimum")).toBe(FLOW_SIZE_SETTING.minimum);
    expect(field("maximum")).toBe(FLOW_SIZE_SETTING.maximum);
    expect(String(field("label"))).toContain(FLOW_SIZE_SETTING.label);
  });
});

describe("the Flow size setting in the settings model", () => {
  it("reads 100 for a Flow that stores none, and for one storing a value Core would not take", () => {
    expect(flowSettingsDraftFromFlow(flowOf()).maxNodesPerSubflow).toBe("100");
    expect(flowSettingsDraftFromFlow(flowOf({ flowSizeSettings: { maxNodesPerSubflow: 0 } })).maxNodesPerSubflow).toBe("100");
    expect(flowSettingsDraftFromFlow(flowOf({ flowSizeSettings: { maxNodesPerSubflow: 150 } })).maxNodesPerSubflow).toBe("150");
  });

  it("states the value on every save, the default included, and keeps it through a read back", () => {
    const draft = flowSettingsDraftFromFlow(flowOf({ flowSizeSettings: { maxNodesPerSubflow: 150 } }));
    const payload = buildFlowSettingsSavePayload(flowOf({ flowSizeSettings: { maxNodesPerSubflow: 150 } }), { ...draft, maxNodesPerSubflow: "100" } as FlowSettingsDraft);
    expect(payload.metadata.flowSizeSettings).toEqual({ maxNodesPerSubflow: 100 });
    const raised = buildFlowSettingsSavePayload(flowOf(), { ...draft, maxNodesPerSubflow: "250" } as FlowSettingsDraft);
    expect(raised.metadata.flowSizeSettings).toEqual({ maxNodesPerSubflow: 250 });
    expect(flowSettingsDraftFromFlow(raised).maxNodesPerSubflow).toBe("250");
  });

  it("refuses a value outside 1 to 1,000, or not whole, or blank, naming the range", () => {
    const draft = flowSettingsDraftFromFlow(flowOf());
    for (const value of ["0", "1.5", "1001", "", "-3"]) {
      expect(flowLimitsInterfaceErrors({ ...draft, maxNodesPerSubflow: value }), value).toContain(RANGE_ERROR);
    }
    for (const value of ["1", "100", "1000"]) {
      expect(flowLimitsInterfaceErrors({ ...draft, maxNodesPerSubflow: value }), value).not.toContain(RANGE_ERROR);
    }
  });

  it("takes the value from the settings detail Core returns", () => {
    const loaded = flowSettingsFlowFromDetail(flowOf(), { flowId: "flow.one", settings: {}, inputs: [], outputs: [], flowSizeSettings: { maxNodesPerSubflow: 320 } });
    expect(flowSettingsDraftFromFlow(loaded).maxNodesPerSubflow).toBe("320");
  });
});

describe("the Maximum nodes per Subflow control", () => {
  const detailOf = (maxNodesPerSubflow: number) => ({
    flowId: "flow.one",
    name: "Flow",
    updatedAt: 8,
    settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.deepseek", execution: { tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } },
    inputs: [],
    outputs: [],
    flowSizeSettings: { maxNodesPerSubflow }
  });

  async function mount(loadedValue: () => number, saveResponseValue: number) {
    const commands = {
      loadFlow: vi.fn(async () => ({ ok: true, payload: { flow: detailOf(loadedValue()) } })),
      listLlmSecrets: vi.fn(async () => ({ ok: true, payload: { keys: [{ id: "key.deepseek", name: "DeepSeek key", kind: "llm", enabled: true, provider: "DeepSeek", scope: "global" }] } })),
      listPublications: vi.fn(async () => ({ ok: true, payload: { publications: [] } })),
      saveFlow: vi.fn(async () => ({ ok: true, payload: { flow: detailOf(saveResponseValue) } }))
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.one", name: "Flow", updatedAt: 7, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />);
    });
    const control = () => renderer.root.find((node) => node.type === "input" && node.props["aria-label"] === "Maximum nodes per Subflow");
    const saveButton = () => renderer.root.find((node) => node.type === "button" && textOf(node) === "Save Settings");
    return { renderer, commands, control, saveButton, unmount: async () => { await act(async () => { renderer.unmount(); }); } };
  }

  it("shows the stored value, saves a change, and shows it again after a reload", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    let stored = 120;
    try {
      const first = await mount(() => stored, 150);
      try {
        expect(first.control().props.value).toBe("120");
        expect(first.control().props.min).toBe(1);
        expect(first.control().props.max).toBe(1000);
        await act(async () => first.control().props.onChange({ target: { value: "150" } }));
        expect(textOf(first.renderer.toJSON())).toContain("Unsaved changes");
        await act(async () => first.saveButton().props.onClick());
        expect((first.commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.flowSizeSettings).toEqual({ maxNodesPerSubflow: 150 });
        stored = 150;
        expect(first.control().props.value).toBe("150");
        const rendered = textOf(first.renderer.toJSON());
        expect(rendered).toContain("Settings saved.");
        expect(rendered).not.toContain("did not take effect");
      } finally {
        await first.unmount();
      }
      const reloaded = await mount(() => stored, stored);
      try {
        expect(reloaded.commands.loadFlow).toHaveBeenCalled();
        expect(reloaded.control().props.value).toBe("150");
      } finally {
        await reloaded.unmount();
      }
    } finally {
      if (previousWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = previousWindow;
    }
  });

  it("does not save a value outside the range", async () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    try {
      const view = await mount(() => 100, 100);
      try {
        await act(async () => view.control().props.onChange({ target: { value: "1001" } }));
        await act(async () => view.saveButton().props.onClick());
        expect(view.commands.saveFlow).not.toHaveBeenCalled();
        expect(textOf(view.renderer.toJSON())).toContain(RANGE_ERROR);
      } finally {
        await view.unmount();
      }
    } finally {
      if (previousWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = previousWindow;
    }
  });
});
