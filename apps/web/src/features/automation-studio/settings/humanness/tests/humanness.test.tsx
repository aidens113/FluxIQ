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
import { HUMANNESS_MAX, HUMANNESS_MIN, HumannessSetting, humannessAfterKey, humannessSavePayload } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function textOf(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.children ? textOf(node.children) : "";
}

const flowOf = (metadata: Record<string, unknown> = {}): any => ({
  flowId: "flow.one", name: "Flow", updatedAt: 7, source: { mode: "visual" }, executionDefaults: {}, interface: { inputs: [], outputs: [] }, metadata
});

function render(value: number | null) {
  const onChange = vi.fn();
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<HumannessSetting value={value} onChange={onChange} />); });
  const slider = () => renderer.root.find((node) => node.type === "input" && node.props.type === "range");
  const button = (label: string) => renderer.root.find((node) => node.type === "button" && textOf(node).startsWith(label));
  return { renderer, onChange, slider, button };
}

describe("the humanness control", () => {
  it("says it uses the starting value when there is none, and offers to set one", () => {
    const view = render(null);
    expect(textOf(view.renderer.toJSON())).toContain("Uses the starting value");
    expect(view.renderer.root.findAll((node) => node.type === "input")).toHaveLength(0);
    act(() => view.button("Set a value").props.onClick());
    expect(view.onChange).toHaveBeenCalledWith(0);
  });

  it("shows the number, labelled ends and a slider bounded 0 to 100", () => {
    const view = render(42);
    const text = textOf(view.renderer.toJSON());
    expect(text).toContain("42");
    expect(text).toContain("Fastest");
    expect(text).toContain("Most human-like");
    expect(view.slider().props.min).toBe(0);
    expect(view.slider().props.max).toBe(100);
    expect(view.slider().props.value).toBe(42);
  });

  it("sends the number when the slider moves, held to the bounds", () => {
    const view = render(42);
    act(() => view.slider().props.onChange({ target: { value: "60" } }));
    expect(view.onChange).toHaveBeenLastCalledWith(60);
    act(() => view.slider().props.onChange({ target: { value: "250" } }));
    expect(view.onChange).toHaveBeenLastCalledWith(100);
    act(() => view.slider().props.onChange({ target: { value: "-4" } }));
    expect(view.onChange).toHaveBeenLastCalledWith(0);
  });

  it("clears back to the starting value", () => {
    const view = render(42);
    act(() => view.button("Use the starting value").props.onClick());
    expect(view.onChange).toHaveBeenLastCalledWith(null);
  });

  it("steps from the keyboard and stops at 0 and 100", () => {
    const view = render(50);
    const press = (key: string) => {
      const preventDefault = vi.fn();
      act(() => view.slider().props.onKeyDown({ key, preventDefault }));
      return preventDefault;
    };
    const expectAfter = (key: string, expected: number) => {
      press(key);
      expect(view.onChange).toHaveBeenLastCalledWith(expected);
    };
    expectAfter("ArrowRight", 51);
    expectAfter("ArrowLeft", 49);
    expectAfter("PageUp", 60);
    expectAfter("PageDown", 40);
    expectAfter("Home", 0);
    expectAfter("End", 100);
    const calls = view.onChange.mock.calls.length;
    expect(press("a")).not.toHaveBeenCalled();
    expect(view.onChange.mock.calls.length).toBe(calls);
    expect(humannessAfterKey(100, "ArrowUp")).toBe(HUMANNESS_MAX);
    expect(humannessAfterKey(0, "ArrowDown")).toBe(HUMANNESS_MIN);
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
  async function mount(detailMetadata: Record<string, unknown>) {
    const detail = { flowId: "flow.one", name: "Flow", updatedAt: 8, settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.deepseek", execution: { tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } }, inputs: [], outputs: [], metadata: detailMetadata };
    const commands = {
      loadFlow: vi.fn(async () => ({ ok: true, payload: { flow: detail } })),
      listLlmSecrets: vi.fn(async () => ({ ok: true, payload: { keys: [{ id: "key.deepseek", name: "DeepSeek key", kind: "llm", enabled: true, provider: "DeepSeek", scope: "global" }] } })),
      listPublications: vi.fn(async () => ({ ok: true, payload: { publications: [] } })),
      saveFlow: vi.fn(async () => ({ ok: true, payload: { flow: { ...detail, updatedAt: 9 } } }))
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.one", name: "Flow", updatedAt: 7, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />);
    });
    const button = (label: string) => renderer.root.find((node) => node.type === "button" && textOf(node).startsWith(label));
    return { renderer, commands, button };
  }
  const withWindow = async (run: () => Promise<void>) => {
    const previous = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    try { await run(); } finally { if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous; }
  };

  it("shows the starting value, sets a number, and sends it through the save", () => withWindow(async () => {
    const view = await mount({});
    expect(textOf(view.renderer.toJSON())).toContain("Uses the starting value");
    await act(async () => view.button("Set a value").props.onClick());
    const slider = view.renderer.root.find((node) => node.type === "input" && node.props.type === "range");
    await act(async () => slider.props.onChange({ target: { value: "70" } }));
    expect(textOf(view.renderer.toJSON())).toContain("Unsaved changes");
    await act(async () => view.button("Save Settings").props.onClick());
    expect((view.commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.humanness).toBe(70);
  }));

  it("clears a stored value by sending null", () => withWindow(async () => {
    const view = await mount({ humanness: 40 });
    expect(view.renderer.root.find((node) => node.type === "input" && node.props.type === "range").props.value).toBe(40);
    await act(async () => view.button("Use the starting value").props.onClick());
    await act(async () => view.button("Save Settings").props.onClick());
    expect((view.commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.humanness).toBeNull();
  }));
});
