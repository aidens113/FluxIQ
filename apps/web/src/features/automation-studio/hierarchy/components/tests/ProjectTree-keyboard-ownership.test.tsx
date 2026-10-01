import { createElement, type ComponentProps, type KeyboardEvent } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutomationProjectTree } from "../ProjectTree";
import { automationHierarchyPageKey } from "../../paged-cache";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => "/synthetic" }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type TreeProps = ComponentProps<typeof AutomationProjectTree>;
let renderer: ReactTestRenderer | undefined;
let frames: Map<number, FrameRequestCallback>;
let sequence: number;
beforeEach(() => {
  frames = new Map(); sequence = 0;
  const request = (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; };
  const cancel = (id: number) => frames.delete(id);
  vi.stubGlobal("window", { requestAnimationFrame: request, cancelAnimationFrame: cancel });
  vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
async function mount(withParts = false) {
  const openView = vi.fn(), setSelection = vi.fn(), requestAction = vi.fn(), loadMoreChildren = vi.fn();
  const elements = new Map<string, { dataset: { treeItemId: string }; focus: ReturnType<typeof vi.fn>; closest(): unknown }>();
  function item(id: string) {
    if (!elements.has(id)) {
      const element = { dataset: { treeItemId: id }, focus: vi.fn(), closest: (): unknown => element };
      elements.set(id, element);
    }
    return elements.get(id)!;
  }
  const viewport = { scrollTop: 0, clientHeight: 360, querySelector: (selector: string) => item(selector.match(/="([^"]+)"/)?.[1] ?? "") };
  const tree = { contains: (candidate: unknown) => [...elements.values()].includes(candidate as ReturnType<typeof item>) };
  const props: TreeProps = {
    nodes: [
      { id: "flow-a", label: "Synthetic flow", kind: "flow", category: "flow", parentId: null, viewId: "flow-nodes", sourceId: "flow.synthetic", flowId: "flow.synthetic" },
      { id: "router-a", label: "Synthetic router", kind: "flow-object", category: "flow", parentId: "flow-a", viewId: "flow-router", sourceId: "flow.synthetic", flowId: "flow.synthetic" }
    ],
    activeViewId: "flow-nodes", selection: null, recordingPrimaryKind: null,
    search: "", typeFilter: "all", setRecordingPrimaryKind: vi.fn(), setSelection, openView, requestAction, loadMoreChildren,
    childPageInfo: { [automationHierarchyPageKey("flow-a")]: { hasMore: true, loadedCount: 1, nextCursor: "synthetic-cursor" } }
  };
  if (withParts) props.nodes.push({ id: "parts-a", label: "Synthetic parts", kind: "folder", category: "flow", parentId: "flow-a", viewId: "flow-nodes", sourceId: "flow.synthetic", flowId: "flow.synthetic", metadata: { flowStructure: "subflows" } });
  await act(async () => { renderer = create(createElement(AutomationProjectTree, props), { createNodeMock: element => {
    const attributes = element.props as Record<string, unknown>;
    if (element.type === "nav") return viewport;
    if (attributes.role === "tree") return tree;
    if (attributes["data-tree-item-id"]) return item(String(attributes["data-tree-item-id"]));
    return null;
  } }); });
  const key = async (id: string, name: string, flags: Record<string, unknown> = {}, nested = false) => {
    const owner = item(id), target = nested ? { closest: () => owner } : owner;
    const preventDefault = vi.fn(), stopPropagation = vi.fn();
    const event = { key: name, target, currentTarget: tree, nativeEvent: {}, preventDefault, stopPropagation, ...flags } as unknown as KeyboardEvent<HTMLElement>;
    await act(async () => renderer!.root.findByProps({ role: "tree" }).props.onKeyDown(event));
    return { preventDefault, stopPropagation };
  };
  const root = () => renderer!.root.findByProps({ "data-tree-item-id": "root-flow" });
  const clearFocus = () => { for (const element of elements.values()) element.focus.mockClear(); };
  const focused = () => [...elements].filter(([, element]) => element.focus.mock.calls.length > 0).map(([id]) => id);
  return { key, item, openView, setSelection, requestAction, loadMoreChildren, root, props, clearFocus, focused };
}
for (const key of ["Enter", " "]) {
  for (const target of ["root Add Flow", "row Add inside", "row main", "row disclosure", "load more", "editable descendant", "native icon descendant"]) {
    it(`${key} from ${target} remains owned by the native descendant`, async () => {
      const state = await mount(target === "row Add inside");
      if (target === "root Add Flow") expect(renderer!.root.findByProps({ "aria-label": "Add Flow" }).type).toBe("button");
      if (target === "row Add inside") expect(renderer!.root.findByProps({ "aria-label": "Add inside Synthetic parts" }).type).toBe("button");
      if (target === "row main") expect(renderer!.root.findAllByType("button").some(button => button.props.title === "Synthetic flow")).toBe(true);
      if (target === "row disclosure") expect(renderer!.root.findByProps({ "aria-label": "Collapse Synthetic flow" }).type).toBe("button");
      if (target === "load more") expect(renderer!.root.findByProps({ className: "automation-tree-page-more" }).type).toBe("button");
      const id = target.startsWith("root") || target === "load more" ? "root-flow" : target === "row Add inside" ? "parts-a" : "flow-a";
      const before = state.root().props["aria-expanded"];
      const event = await state.key(id, key, {}, true);
      expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(state.root().props["aria-expanded"]).toBe(before); expect(state.openView).not.toHaveBeenCalled();
      expect(state.requestAction).not.toHaveBeenCalled(); expect(state.setSelection).not.toHaveBeenCalled();
    });
  }
}
for (const [name, flags] of [
  ["handled", { defaultPrevented: true }], ["synthetic composition", { isComposing: true }],
  ["native composition", { nativeEvent: { isComposing: true } }], ["native229", { nativeEvent: { keyCode: 229 } }],
  ["Alt", { altKey: true }], ["Control", { ctrlKey: true }], ["Meta", { metaKey: true }], ["Shift", { shiftKey: true }]
] as const) {
  it(`ignores ${name} direct activation and navigation`, async () => {
    const state = await mount();
    frames.clear();
    for (const key of ["Enter", " ", "ArrowDown", "Home", "End", "ArrowRight", "ArrowLeft"]) {
      const event = await state.key("root-flow", key, flags);
      expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);
    }
    expect(state.root().props["aria-expanded"]).toBe(true); expect(state.openView).not.toHaveBeenCalled();
    expect(state.requestAction).not.toHaveBeenCalled(); expect(state.item("flow-a").focus).not.toHaveBeenCalled();
  });
}
it("preserves plain direct root Enter and Space disclosure", async () => {
  const state = await mount(); expect((await state.key("root-flow", "Enter")).preventDefault).toHaveBeenCalledOnce();
  expect(state.root().props["aria-expanded"]).toBe(false);
  expect((await state.key("root-flow", " ")).preventDefault).toHaveBeenCalledOnce(); expect(state.root().props["aria-expanded"]).toBe(true);
});
it("preserves direct row activation and native Add Flow click", async () => {
  const state = await mount(true); await state.key("flow-a", "Enter"); expect(state.openView).toHaveBeenCalled();
  const button = renderer!.root.findByProps({ "aria-label": "Add Flow" });
  await act(async () => button.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() }));
  expect(state.requestAction).toHaveBeenCalledOnce();
  await act(async () => renderer!.root.findByProps({ "aria-label": "Add inside Synthetic parts" }).props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() }));
  expect(state.requestAction).toHaveBeenCalledTimes(2);
  await act(async () => renderer!.root.findByProps({ className: "automation-tree-page-more" }).props.onClick());
  expect(state.loadMoreChildren).toHaveBeenCalledWith("flow-a");
});
it("preserves plain direct traversal focus and wrapping", async () => {
  const state = await mount();
  for (const [id, key, destination] of [["root-flow", "ArrowDown", "flow-a"], ["flow-a", "ArrowRight", "router-a"], ["router-a", "ArrowLeft", "flow-a"], ["root-flow", "End", "router-a"], ["router-a", "ArrowDown", "root-flow"], ["root-flow", "ArrowUp", "router-a"], ["router-a", "Home", "root-flow"]]) {
    state.clearFocus();
    const event = await state.key(id!, key!); expect(event.preventDefault).toHaveBeenCalledOnce();
    const pending = [...frames.values()]; frames.clear(); await act(async () => { for (const frame of pending) frame(0); });
    expect(state.item(destination!).focus).toHaveBeenCalled();
    expect(state.item(destination!).focus).toHaveBeenCalledOnce(); expect(state.focused()).toEqual([destination]);
  }
});
