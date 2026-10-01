import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorPanel } from "../InspectorPanel";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let view: ReactTestRenderer;
const render = (id: string, kind: "node" | "flow" = "node") => <InspectorPanel identity={{ id, title: "Synthetic object", label: "Object", breadcrumb: [] }} model={null} selection={{ kind, id }} stateNodeId="" onOpenState={() => {}} />;
const copy = () => view.root.findAllByType("button").find((node) => node.props["aria-label"] === "Copy selected object ID")!;
const text = () => JSON.stringify(view.toJSON());
beforeEach(() => vi.stubGlobal("window", { setTimeout: vi.fn() }));
afterEach(() => { if (view) act(() => view.unmount()); vi.unstubAllGlobals(); });

describe("selected ID clipboard ownership", () => {
  it("does not acknowledge an old selection in its replacement", async () => {
    let resolve!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>((yes) => { resolve = yes; }) } });
    await act(async () => { view = create(render("synthetic-one")); }); act(() => copy().props.onClick());
    act(() => view.update(render("synthetic-two"))); await act(async () => resolve());
    expect(text()).not.toContain("Copied"); expect(copy().props.disabled).toBe(false);
  });
  it("acknowledges success and clears it on a new selection", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    await act(async () => { view = create(render("synthetic-one")); }); await act(async () => copy().props.onClick());
    expect(text()).toContain("Copied to clipboard");
    act(() => view.update(render("synthetic-two"))); expect(text()).not.toContain("Copied");
  });
  it("offers safe manual copy after denial", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("synthetic-private-error")) } });
    await act(async () => { view = create(render("synthetic-one")); }); await act(async () => copy().props.onClick());
    expect(text()).toContain("copy it manually"); expect(text()).not.toContain("synthetic-private-error");
  });
  it("fences old feedback when selection kind changes with the same ID", async () => {
    let resolve!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: () => new Promise<void>((yes) => { resolve = yes; }) } });
    await act(async () => { view = create(render("synthetic-one")); }); act(() => copy().props.onClick());
    act(() => view.update(render("synthetic-one", "flow"))); await act(async () => resolve());
    expect(text()).not.toContain("Copied"); expect(copy().props.disabled).toBe(false);
  });
});
