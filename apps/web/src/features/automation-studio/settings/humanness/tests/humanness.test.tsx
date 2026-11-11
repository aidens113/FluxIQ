// Humanness (0-100) in the hosted panel's Flow settings: the control, the draft, and the payload
// update-flow-settings receives (`metadata.humanness`: a number, or null to clear).

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { FlowSettingsViewContent, buildFlowSettingsSavePayload, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail } from "../../index";
import { FakeElement, withFakeDocument } from "@fluxiq/ui-components/testing";
import { HumannessSetting, humannessSavePayload } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function textOf(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.children ? textOf(node.children) : "";
}

const flowOf = (metadata: Record<string, unknown> = {}): any => ({
  flowId: "flow.one", name: "Flow", updatedAt: 7, source: { mode: "visual" }, executionDefaults: {}, interface: { inputs: [], outputs: [] }, metadata
});

const settle = async () => { await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); }); };

async function render(value: number | null, starting?: number) {
  const onChange = vi.fn();
  const host = new FakeElement("div");
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<HumannessSetting value={value} starting={starting} onChange={onChange} />, { createNodeMock: () => host }); });
  const slider = () => host.descendants().find((element) => element.className.includes("humanness-range"))!;
  const clear = () => host.byClass("humanness-clear")[0]!;
  return { renderer, host, onChange, slider, clear };
}

describe("the humanness control", () => {
  it("mounts the shared control, not a panel-local slider", async () => {
    await withFakeDocument(async () => {
      const view = await render(42);
      expect(view.host.children).toHaveLength(1);
      expect(view.host.children[0]!.className).toBe("humanness");
      expect(view.host.textContent).toContain("Fastest");
      expect(view.host.textContent).toContain("Most human-like");
      expect(view.slider().value).toBe("42");
      await act(async () => view.renderer.unmount());
      expect(view.host.children).toHaveLength(0);
    });
  });

  it("says it uses the starting value when there is none", async () => {
    await withFakeDocument(async () => {
      const view = await render(null);
      expect(view.host.textContent).toContain("Uses your starting value (0)");
      const given = await render(null, 35);
      expect(given.host.textContent).toContain("Uses your starting value (35)");
    });
  });

  it("sends the number when the slider is set", async () => {
    await withFakeDocument(async () => {
      const view = await render(null, 35);
      const slider = view.slider();
      slider.value = "60";
      await act(async () => slider.dispatch("change"));
      await settle();
      expect(view.onChange).toHaveBeenLastCalledWith(60);
    });
  });

  it("sends null when cleared back to the starting value", async () => {
    await withFakeDocument(async () => {
      const view = await render(42, 35);
      await act(async () => view.clear().dispatch("click"));
      await settle();
      expect(view.onChange).toHaveBeenLastCalledWith(null);
    });
  });

  it("shows a value read again", async () => {
    await withFakeDocument(async () => {
      const view = await render(40);
      await act(async () => view.renderer.update(<HumannessSetting value={null} starting={10} onChange={view.onChange} />));
      expect(view.host.textContent).toContain("Uses your starting value (10)");
    });
  });
});

describe("humanness in the Flow settings draft and save", () => {
  it("is empty when the Flow has no value, and read back when it has one", () => {
    expect(flowSettingsDraftFromFlow(flowOf()).humanness).toBe("");
    expect(flowSettingsDraftFromFlow(flowOf({ humanness: 0 })).humanness).toBe("0");
    expect(flowSettingsDraftFromFlow(flowOf({ humanness: 100 })).humanness).toBe("100");
    expect(flowSettingsDraftFromFlow(flowOf({ humanness: 101 })).humanness).toBe("");
    expect(flowSettingsDraftFromFlow(flowOf({ humanness: "7" })).humanness).toBe("");
  });

  it("saves the number, the bounds, and null when cleared", () => {
    const draft = flowSettingsDraftFromFlow(flowOf());
    expect(buildFlowSettingsSavePayload(flowOf(), { ...draft, humanness: "65" }).metadata.humanness).toBe(65);
    expect(buildFlowSettingsSavePayload(flowOf(), { ...draft, humanness: "0" }).metadata.humanness).toBe(0);
    expect(buildFlowSettingsSavePayload(flowOf(), { ...draft, humanness: "100" }).metadata.humanness).toBe(100);
    expect(buildFlowSettingsSavePayload(flowOf({ humanness: 65 }), { ...draft, humanness: "" }).metadata.humanness).toBeNull();
    expect(humannessSavePayload("")).toBeNull();
  });

  it("takes the stored value from the loaded detail, and drops it when the detail has none", () => {
    expect(flowSettingsFlowFromDetail(flowOf(), { flowId: "flow.one", metadata: { humanness: 30 } }).metadata.humanness).toBe(30);
    expect(flowSettingsFlowFromDetail(flowOf({ humanness: 30 }), { flowId: "flow.one", metadata: {} }).metadata.humanness).toBeUndefined();
  });
});

describe("humanness in the Settings view", () => {
  async function mount(detailMetadata: Record<string, unknown>, host: FakeElement) {
    const detail = { flowId: "flow.one", name: "Flow", updatedAt: 8, settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.deepseek", execution: { tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } }, inputs: [], outputs: [], metadata: detailMetadata };
    const commands = {
      loadFlow: vi.fn(async () => ({ ok: true, payload: { flow: detail } })),
      listLlmSecrets: vi.fn(async () => ({ ok: true, payload: { keys: [{ id: "key.deepseek", name: "DeepSeek key", kind: "llm", enabled: true, provider: "DeepSeek", scope: "global" }] } })),
      listPublications: vi.fn(async () => ({ ok: true, payload: { publications: [] } })),
      saveFlow: vi.fn(async () => ({ ok: true, payload: { flow: { ...detail, updatedAt: 9 } } }))
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.one", name: "Flow", updatedAt: 7, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />, { createNodeMock: () => host });
    });
    const button = (label: string) => renderer.root.find((node) => node.type === "button" && textOf(node).startsWith(label));
    return { renderer, commands, button };
  }
  const withWindow = async (run: (host: FakeElement) => Promise<void>) => {
    const previous = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    try { await withFakeDocument(() => run(new FakeElement("div"))); } finally { if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous; }
  };
  const rangeOf = (host: FakeElement) => host.descendants().find((element) => element.className.includes("humanness-range"))!;

  it("shows the starting value, sets a number, and sends it through the save", () => withWindow(async (host) => {
    const view = await mount({}, host);
    expect(host.textContent).toContain("Uses your starting value");
    const slider = rangeOf(host);
    slider.value = "70";
    await act(async () => slider.dispatch("change"));
    await settle();
    expect(textOf(view.renderer.toJSON())).toContain("Unsaved changes");
    await act(async () => view.button("Save Settings").props.onClick());
    expect((view.commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.humanness).toBe(70);
  }));

  it("clears a stored value by sending null", () => withWindow(async (host) => {
    const view = await mount({ humanness: 40 }, host);
    expect(rangeOf(host).value).toBe("40");
    await act(async () => host.byClass("humanness-clear")[0]!.dispatch("click"));
    await settle();
    await act(async () => view.button("Save Settings").props.onClick());
    expect((view.commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.humanness).toBeNull();
  }));
});
