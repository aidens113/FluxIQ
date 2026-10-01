import { act } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tree } from "../Tree";

// react-test-renderer has no DOM event propagation: each test explicitly bubbles
// one event through the actual mounted child/ancestor handlers and current refs.
class HostItem {
  constructor(readonly id: string, readonly focused: string[]) {}
  focus() { this.focused.push(this.id); }
  closest() { return this; }
}
let renderer: ReactTestRenderer | undefined;
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => { if (renderer) act(() => renderer?.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

function fixture() {
  const selected: string[] = [], toggled: string[] = [], focused: string[] = [], frames: FrameRequestCallback[] = [];
  const hosts = new Map<string, HostItem>();
  const action = vi.fn();
  vi.stubGlobal("Element", HostItem);
  vi.stubGlobal("window", { requestAnimationFrame: (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; } });
  act(() => { renderer = create(<Tree label="Items" expandedIds={new Set(["parent", "child"])} nodes={[
    { id: "parent", label: "Parent", children: [
      { id: "child", label: "Child", actions: <button type="button" onClick={action}>Child action</button>, children: [{ id: "grand", label: "Grand" }] },
      { id: "disabled", label: "Disabled", disabled: true }
    ] }, { id: "tail", label: "Tail" }
  ]} onSelect={id => selected.push(id)} onToggle={id => toggled.push(id)} />, { createNodeMock: node => {
    if (node.type !== "li") return {};
    const props = node.props as { children: [{ props: { children: [unknown, unknown, { props: { children: string } }] } }] };
    const label = props.children[0].props.children[2].props.children;
    const host = new HostItem(label.toLowerCase(), focused); hosts.set(host.id, host); return host;
  } }); });
  const item = (id: string): ReactTestInstance => renderer!.root.findAllByProps({ role: "treeitem" }).find(node => node.props.children[0].props.children[2].props.children.toLowerCase() === id)!;
  function bubble(id: string, key: string, overrides: Record<string, unknown> = {}, target = hosts.get(id)) {
    const event = { key, keyCode: 0, nativeEvent: { isComposing: false, keyCode: 0 }, defaultPrevented: false,
      altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target, currentTarget: target,
      preventDefault: vi.fn(() => { event.defaultPrevented = true; }), ...overrides };
    act(() => { for (const owner of [id, ...(id === "grand" ? ["child", "parent"] : ["child", "disabled"].includes(id) ? ["parent"] : [])]) {
      event.currentTarget = hosts.get(owner); item(owner).props.onKeyDown(event);
    } });
    return event;
  }
  function focus(id: string, target = hosts.get(id)) {
    act(() => { for (const owner of [id, ...(id === "grand" ? ["child", "parent"] : ["child", "disabled"].includes(id) ? ["parent"] : [])]) item(owner).props.onFocus({ target, currentTarget: hosts.get(owner) }); });
  }
  return { selected, toggled, focused, frames, hosts, item, bubble, focus, action,
    flush: () => act(() => { frames.splice(0).forEach(frame => frame(0)); }) };
}

describe("Tree originating event ownership (simulated React bubbling)", () => {
  it.each(["Enter", " "])("selects only the child for %j", key => {
    const f = fixture(), event = f.bubble("child", key);
    expect(f.selected).toEqual(["child"]); expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
  it.each(["Enter", " "])("disabled child does not select its parent for %j", key => {
    const f = fixture(); f.bubble("disabled", key); expect(f.selected).toEqual([]);
  });
  it.each([["ArrowDown", "grand"], ["ArrowUp", "parent"], ["Home", "parent"], ["End", "tail"]])("navigates child %s once to %s", (key, destination) => {
    const f = fixture(); f.bubble("child", key); expect(f.frames).toHaveLength(1); f.flush(); expect(f.focused).toEqual([destination]);
  });
  it("right enters a child only once and left collapses only its own branch", () => {
    const f = fixture(); f.bubble("child", "ArrowRight"); expect(f.frames).toHaveLength(1); f.flush(); expect(f.focused).toEqual(["grand"]);
    f.bubble("child", "ArrowLeft"); expect(f.toggled).toEqual(["child"]);
  });
  it("left on a leaf focuses its parent without collapsing that parent", () => {
    const f = fixture(); f.bubble("grand", "ArrowLeft"); f.flush(); expect(f.focused).toEqual(["child"]); expect(f.toggled).toEqual([]);
  });
  it("focus bubbling retains the child as the sole roving item", () => {
    const f = fixture(); f.focus("child"); expect(f.item("child").props.tabIndex).toBe(0);
    expect(renderer!.root.findAllByProps({ role: "treeitem" }).filter(node => node.props.tabIndex === 0)).toEqual([f.item("child")]);
  });
  it("action focus and keys do not acquire tree ownership; its click callback still works separately", () => {
    const f = fixture(); f.focus("tail"); const target = new HostItem("action", f.focused);
    f.focus("child", target); expect(f.item("tail").props.tabIndex).toBe(0);
    for (const key of ["Enter", " ", "ArrowDown", "ArrowLeft"]) expect(f.bubble("child", key, {}, target).preventDefault).not.toHaveBeenCalled();
    expect(f.selected).toEqual([]); expect(f.toggled).toEqual([]); expect(f.frames).toHaveLength(0);
    act(() => renderer!.root.findAllByType("button").find(node => node.props.children === "Child action")!.props.onClick()); expect(f.action).toHaveBeenCalledTimes(1);
  });
  it.each([
    { defaultPrevented: true }, { nativeEvent: { isComposing: true, keyCode: 0 } },
    { nativeEvent: { isComposing: false, keyCode: 229 } }, { keyCode: 229 },
    { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }
  ])("leaves handled/composing/modifier event untouched: %j", overrides => {
    const f = fixture(); for (const key of ["Enter", " ", "ArrowDown", "ArrowLeft"]) {
      const event = f.bubble("child", key, overrides); expect(event.preventDefault).not.toHaveBeenCalled();
    } expect(f.selected).toEqual([]); expect(f.toggled).toEqual([]); expect(f.frames).toHaveLength(0);
  });
  it("toggle-button keys remain owned by the button and its click still toggles", () => {
    const f = fixture(); const target = new HostItem("toggle", f.focused);
    expect(f.bubble("child", "Enter", {}, target).preventDefault).not.toHaveBeenCalled(); expect(f.selected).toEqual([]);
    const stopPropagation = vi.fn(); act(() => f.item("child").findAllByType("button").find(node => node.props["aria-label"] === "Collapse Child")!.props.onClick({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledTimes(1); expect(f.toggled).toEqual(["child"]);
  });
  it("preserves direct item and pointer selection, including the nested-click guard", () => {
    const f = fixture(); f.bubble("parent", "Enter"); expect(f.selected).toEqual(["parent"]);
    act(() => { f.item("child").props.onClick({ target: f.hosts.get("child"), currentTarget: f.hosts.get("child") }); f.item("parent").props.onClick({ target: f.hosts.get("child"), currentTarget: f.hosts.get("parent") }); });
    expect(f.selected).toEqual(["parent", "child"]);
  });
});
