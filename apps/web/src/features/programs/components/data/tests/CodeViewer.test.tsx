import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeViewer } from "..";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer;
const copy = () => view.root.findAllByType("button").find((node) => node.props["aria-label"] === "Copy source")!;
const text = () => JSON.stringify(view.toJSON());
async function mount(code = "synthetic-source") { await act(async () => { view = create(<CodeViewer label="Synthetic source" code={code} />); }); }
beforeEach(() => vi.stubGlobal("window", { dispatchEvent: vi.fn() }));
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("source clipboard feedback", () => {
  it("offers manual copy when the API is missing", async () => {
    vi.stubGlobal("navigator", {}); await mount();
    await act(async () => copy().props.onClick());
    expect(text()).toContain("copy it manually");
  });
  it("locks pending writes and ignores acknowledgement after source replacement", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((yes) => { resolve = yes; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } }); await mount();
    act(() => { const activate = copy().props.onClick; activate(); activate(); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(copy().props.disabled).toBe(true);
    act(() => view.update(<CodeViewer label="Synthetic source" code="synthetic-replacement" />));
    await act(async () => resolve());
    expect(text()).not.toContain("Copied to clipboard");
    expect(copy().props.disabled).toBe(false);
    expect(text()).toContain("synthetic-replacement");
  });
  it("keeps search and wrapping usable while copying", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>(() => {}) } }); await mount("alpha alpha");
    act(() => copy().props.onClick());
    act(() => view.root.findByType("input").props.onChange({ target: { value: "alpha" } }));
    expect(view.root.findByProps({ className: "code-viewer-matches" }).children.join("")).toBe("2 matches");
    const wrap = view.root.findAllByType("button").find((node) => node.props["aria-label"] === "Toggle line wrapping")!;
    act(() => wrap.props.onClick()); expect(view.root.findByType("pre").props.className).toBe("wrap");
  });
  it("ignores old feedback when a different labelled source has identical contents", async () => {
    let resolve!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>((yes) => { resolve = yes; }) } });
    await mount(); act(() => copy().props.onClick());
    act(() => view.update(<CodeViewer label="Other synthetic source" code="synthetic-source" />));
    await act(async () => resolve());
    expect(text()).not.toContain("Copied to clipboard"); expect(copy().props.disabled).toBe(false);
  });
});
