import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateRawPanel } from "../StateRawPanel";
import type { NodeStateViewModel } from "../model";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer;
const model: NodeStateViewModel = { title: "Synthetic", subtitle: "", sources: [], activeSource: null, phases: [], activePhase: "input", facts: [], evidence: [], overlays: [], structuredRows: [], diffRows: [], raw: { value: "synthetic-value" }, summary: { facts: 0, evidence: 0, strong: 0, weak: 0, negative: 0, ignored: 0 } };
const text = () => JSON.stringify(view.toJSON());
const button = (label: string) => view.root.findAllByType("button").find((node) => node.children.filter((child) => typeof child === "string").join("").includes(label))!;
async function mount() { await act(async () => { view = create(<StateRawPanel model={model} />); }); }
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("raw JSON copy lifecycle", () => {
  it("offers manual copy without throwing when the browser API is missing", async () => {
    vi.stubGlobal("navigator", {}); await mount(); act(() => button("Show raw JSON").props.onClick());
    await act(async () => button("Copy JSON").props.onClick()); expect(text()).toContain("copy it manually");
  });
  it("does not restore old acknowledgement after collapse and reopening", async () => {
    let resolve!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>((yes) => { resolve = yes; }) } });
    await mount(); act(() => button("Show raw JSON").props.onClick()); act(() => button("Copy JSON").props.onClick());
    act(() => button("Hide raw JSON").props.onClick()); await act(async () => resolve());
    act(() => button("Show raw JSON").props.onClick()); expect(text()).not.toContain("Copied");
  });
  it("does not serialize a collapsed source and preserves region controls", async () => {
    const toJSON = vi.fn(() => ({ value: "synthetic-value" }));
    await act(async () => { view = create(<StateRawPanel model={{ ...model, raw: { toJSON } }} />); });
    expect(toJSON).not.toHaveBeenCalled();
    const show = button("Show raw JSON"); const region = show.props["aria-controls"];
    act(() => show.props.onClick()); expect(toJSON).toHaveBeenCalledTimes(1);
    expect(view.root.findByType("section").props.id).toBe(region);
    expect(button("Hide raw JSON").props["aria-expanded"]).toBe("true");
  });
  it("fences old acknowledgement when phase changes with identical raw JSON", async () => {
    let resolve!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>((yes) => { resolve = yes; }) } });
    await mount(); act(() => button("Show raw JSON").props.onClick()); act(() => button("Copy JSON").props.onClick());
    act(() => view.update(<StateRawPanel model={{ ...model, activePhase: "actual_output" }} />));
    await act(async () => resolve()); expect(text()).not.toContain("Copied");
    expect(button("Copy JSON").props.disabled).toBe(false);
  });
});
