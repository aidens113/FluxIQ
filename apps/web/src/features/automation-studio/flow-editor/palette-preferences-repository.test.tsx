import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowNodePalette } from "./FlowNodePalette";
import { NODE_PALETTE_FAVORITES_STORAGE_KEY, readNodePaletteFavoritesFromLocalStorage, saveNodePaletteFavoritesToLocalStorage } from "./palette-preferences-repository";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const originalWindow = globalThis.window;
afterEach(() => { Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow }); });

function storageWindow(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(NODE_PALETTE_FAVORITES_STORAGE_KEY, initial);
  return { localStorage: { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) } };
}

describe("node palette preferences", () => {
  it("deduplicates persisted favorites and cleans stale IDs against the current registry", async () => {
    const repository = { readFavorites: vi.fn(() => ["node.valid", "node.valid", "node.stale"]), saveFavorites: vi.fn() };
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<FlowNodePalette collapsed={false} groups={[{ title: "Core", nodes: [{ id: "node.valid", label: "Valid", description: "Valid node", family: "control" } as any] }]} id="palette" title="Flow Nodes" preferencesRepository={repository} onAddNode={() => undefined} onCollapsedChange={() => undefined} />); });
    expect(repository.saveFavorites).toHaveBeenCalledWith(["node.valid"]);
    await act(async () => renderer.unmount());
  });

  it("persists deduped values and tolerates denied browser storage", () => {
    const allowed = storageWindow('["node.a","node.a","node.b"]');
    Object.defineProperty(globalThis, "window", { configurable: true, value: allowed });
    expect(readNodePaletteFavoritesFromLocalStorage()).toEqual(["node.a", "node.b"]);
    saveNodePaletteFavoritesToLocalStorage(["node.b", "node.b", "node.c"]);
    expect(allowed.localStorage.setItem).toHaveBeenCalledWith(NODE_PALETTE_FAVORITES_STORAGE_KEY, '["node.b","node.c"]');
    Object.defineProperty(globalThis, "window", { configurable: true, value: Object.defineProperty({}, "localStorage", { get() { throw new Error("denied"); } }) });
    expect(readNodePaletteFavoritesFromLocalStorage()).toEqual([]);
    expect(() => saveNodePaletteFavoritesToLocalStorage(["node.a"])).not.toThrow();
  });

  it("keeps Session Recent session-only and renders truthful empty states", async () => {
    const repository = { readFavorites: () => [], saveFavorites: vi.fn() };
    const onAddNode = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<FlowNodePalette collapsed={false} groups={[{ title: "Core", nodes: [{ id: "node.a", label: "Action", description: "Do work", family: "action" } as any] }]} id="palette" title="Flow Nodes" preferencesRepository={repository} onAddNode={onAddNode} onCollapsedChange={() => undefined} />); });
    const mode = (label: string) => renderer.root.findAllByType("button").find((item) => item.children.includes(label))!;
    await act(async () => mode("Session Recent").props.onClick());
    expect(renderer.root.findByType("p").children.join("")).toContain("No nodes added in this session");
    await act(async () => mode("All").props.onClick());
    await act(async () => renderer.root.findAllByType("button").find((item) => item.props.className === "automation-node-palette-add")!.props.onClick());
    await act(async () => mode("Session Recent").props.onClick());
    expect(renderer.root.findAllByType("strong").some((item) => item.children.includes("Action"))).toBe(true);
    expect(onAddNode).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("materializes node categories progressively while keeping search complete", async () => {
    const repository = { readFavorites: () => [], saveFavorites: vi.fn() };
    const groups = [
      { title: "Core", nodes: [{ id: "node.start", label: "Start", description: "Start here", family: "control" } as any] },
      { title: "Actions", nodes: [{ id: "node.click", label: "Click", description: "Click an element", family: "action" } as any] }
    ];
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<FlowNodePalette collapsed={false} groups={groups} id="palette" title="Flow Nodes" preferencesRepository={repository} onAddNode={() => undefined} onCollapsedChange={() => undefined} />); });
    const addLabels = () => renderer.root.findAll((item) => item.props.className === "automation-node-palette-add").map((item) => item.props.title);
    expect(addLabels()).toEqual(["Start here", "Click an element"]);
    const actionsToggle = renderer.root.findAllByType("button").find((item) => item.props["aria-controls"] === "palette-group-Actions")!;
    expect(actionsToggle.props["aria-expanded"]).toBe(true);
    await act(async () => actionsToggle.props.onClick());
    expect(addLabels()).toEqual(["Start here"]);
    const coreToggle = renderer.root.findAllByType("button").find((item) => item.props["aria-controls"] === "palette-group-Core")!;
    expect(coreToggle.props["aria-expanded"]).toBe(true);
    await act(async () => actionsToggle.props.onClick());
    const search = renderer.root.findByProps({ "aria-label": "Search nodes" });
    await act(async () => search.props.onChange({ target: { value: "Click" } }));
    expect(addLabels()).toEqual(["Click an element"]);
    await act(async () => renderer.unmount());
  });
});
