import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tooltip } from "../Tooltip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
type Listener = (event: KeyboardEvent) => void;
type ElementFixture = { ownerDocument: Document; contains(target: unknown): boolean };
let renderer: ReactTestRenderer | undefined;
let anchor: ElementFixture;
let trigger: object;
let popup: object;
let bridge: object;
let outside: object;
let documentFixture: { visibilityState: string; hasFocus(): boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };
let listeners: Set<Listener>;
let activeDocument: boolean;
const wrapper = () => renderer!.root.findAllByType("span").find((node) => node.props.className === "tooltip-anchor")!;
const content = () => renderer!.root.findAllByType("span").find((node) => node.props.role === "tooltip")!;
const open = () => wrapper().props["data-open"] === true || wrapper().props["data-open"] === "true";
function dispatch(node: ReactTestInstance, event: string, options: Record<string, unknown> = {}) {
  expect(node.props[event]).toBeTypeOf("function");
  act(() => node.props[event]({ currentTarget: anchor, target: trigger, relatedTarget: outside, pointerType: "mouse", ...options }));
}
function escape(options: Record<string, unknown> = {}, listener?: Listener) {
  const event = { key: "Escape", defaultPrevented: false, isComposing: false, keyCode: 27, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...options };
  act(() => { if (listener) listener(event as unknown as KeyboardEvent); else for (const callback of [...listeners]) callback(event as unknown as KeyboardEvent); });
  return event;
}
async function mount(child: React.ReactNode = <button aria-label="Action">Action</button>, text = "Supplemental help") {
  await act(async () => { renderer = create(<Tooltip content={text}>{child}</Tooltip>, { createNodeMock: (element) => (element.props as { className?: string }).className === "tooltip-anchor" ? anchor : null }); });
}
beforeEach(() => {
  trigger = {}; popup = {}; bridge = {}; outside = {}; listeners = new Set(); activeDocument = true;
  documentFixture = { visibilityState: "visible", hasFocus: () => activeDocument, addEventListener: vi.fn((_name: string, listener: Listener) => listeners.add(listener)), removeEventListener: vi.fn((_name: string, listener: Listener) => listeners.delete(listener)) };
  anchor = { ownerDocument: documentFixture as unknown as Document, contains: (target) => [anchor, trigger, popup, bridge].includes(target as object) };
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.restoreAllMocks(); });

it("opens with native focus, dismisses Escape without consuming it, and reopens after departure", async () => {
  const focus = vi.fn(), click = vi.fn(); await mount(<button aria-label="Action" onFocus={focus} onClick={click}>Action</button>);
  expect(open()).toBe(false); dispatch(wrapper(), "onFocus"); expect(open()).toBe(true);
  const key = escape(); expect(open()).toBe(false); expect(key.preventDefault).not.toHaveBeenCalled(); expect(key.stopPropagation).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled();
  dispatch(wrapper(), "onFocus"); expect(open()).toBe(false);
  dispatch(wrapper(), "onBlur"); dispatch(wrapper(), "onFocus"); expect(open()).toBe(true);
  expect(renderer!.root.findByType("button").props.onFocus).toBe(focus);
});
it("dismisses mouse-only hover with the current document and removes closed listeners", async () => {
  await mount(); expect(listeners.size).toBe(0); dispatch(wrapper(), "onPointerEnter"); expect(open()).toBe(true); expect(listeners.size).toBe(1);
  escape(); expect(open()).toBe(false); expect(listeners.size).toBe(0);
  dispatch(wrapper(), "onPointerLeave"); dispatch(wrapper(), "onPointerEnter"); expect(open()).toBe(true);
});
it.each(["hover-first", "focus-first"])("does not reopen dismissed mixed ownership until both modes leave (%s)", async (order) => {
  await mount(); dispatch(wrapper(), order === "hover-first" ? "onPointerEnter" : "onFocus"); dispatch(wrapper(), order === "hover-first" ? "onFocus" : "onPointerEnter"); escape();
  dispatch(wrapper(), "onPointerLeave"); expect(open()).toBe(false);
  dispatch(wrapper(), "onPointerEnter"); expect(open()).toBe(false);
  dispatch(wrapper(), "onBlur"); expect(open()).toBe(false);
  dispatch(wrapper(), "onPointerLeave"); dispatch(wrapper(), "onFocus"); expect(open()).toBe(true);
});
it.each(["popup", "bridge"])("keeps pointer ownership within the current anchor (%s)", async (part) => {
  await mount(); dispatch(wrapper(), "onPointerEnter");
  dispatch(wrapper(), "onPointerLeave", { relatedTarget: part === "popup" ? popup : bridge }); expect(open()).toBe(true);
  dispatch(wrapper(), "onPointerLeave"); expect(open()).toBe(false);
});
it("keeps focus within descendants, closes on actual blur, and rejects foreign event targets", async () => {
  await mount(); dispatch(wrapper(), "onFocus"); dispatch(wrapper(), "onBlur", { relatedTarget: popup }); expect(open()).toBe(true);
  dispatch(wrapper(), "onBlur"); expect(open()).toBe(false);
  dispatch(wrapper(), "onFocus", { target: outside }); expect(open()).toBe(false);
  dispatch(wrapper(), "onPointerEnter", { currentTarget: {} }); expect(open()).toBe(false);
});
it.each(["mouse", "pen"])("allows %s hover without changing child activation", async (pointerType) => {
  const click = vi.fn(); await mount(<button onClick={click}>Action</button>); dispatch(wrapper(), "onPointerEnter", { pointerType }); expect(open()).toBe(true); expect(click).not.toHaveBeenCalled();
});
it("does not create sticky touch hover but preserves native touch-induced focus", async () => {
  await mount(); dispatch(wrapper(), "onPointerEnter", { pointerType: "touch" }); expect(open()).toBe(false); dispatch(wrapper(), "onFocus"); expect(open()).toBe(true);
});
it.each([{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { key: "Enter" }])("leaves popup unchanged on an ineligible key (%j)", async (options) => {
  await mount(); dispatch(wrapper(), "onFocus"); escape(options); expect(open()).toBe(true);
});
it.each(["hidden", "inactive"])("ignores keys from a %s document", async (state) => {
  await mount(); dispatch(wrapper(), "onFocus"); if (state === "hidden") documentFixture.visibilityState = "hidden"; else activeDocument = false;
  escape(); expect(open()).toBe(true); dispatch(wrapper(), "onBlur"); expect(open()).toBe(false);
});
it("preserves child descriptions, IDs and native handlers through dismissal and text updates", async () => {
  const click = vi.fn(), key = vi.fn(), focus = vi.fn(), pointer = vi.fn();
  const child = <a href="/synthetic" aria-describedby="caller-hint caller-error" onClick={click} onKeyDown={key} onFocus={focus} onPointerEnter={pointer}>Native link</a>;
  await mount(child); const id = content().props.id; const link = renderer!.root.findByType("a");
  expect(link.props["aria-describedby"]).toBe(`caller-hint caller-error ${id}`); expect(link.props.href).toBe("/synthetic");
  expect(link.props.onClick).toBe(click); expect(link.props.onKeyDown).toBe(key); expect(link.props.onFocus).toBe(focus); expect(link.props.onPointerEnter).toBe(pointer);
  dispatch(wrapper(), "onFocus"); escape();
  await act(async () => renderer!.update(<Tooltip content="Updated description">{child}</Tooltip>));
  expect(open()).toBe(false); expect(content().props.id).toBe(id); expect(content().children).toEqual(["Updated description"]); expect(link.props["aria-describedby"]).toBe(`caller-hint caller-error ${id}`);
  for (const name of ["Enter", " ", "Escape"]) act(() => link.props.onKeyDown({ key: name }));
  act(() => link.props.onClick({ metaKey: true })); expect(key).toHaveBeenCalledTimes(3); expect(click).toHaveBeenCalledTimes(1); expect(open()).toBe(false);
});
it("retains full description text while closed and keeps sibling IDs unique", async () => {
  await act(async () => { renderer = create(<><Tooltip content="First"><button>First</button></Tooltip><Tooltip content="Second"><button>Second</button></Tooltip></>, { createNodeMock: (element) => (element.props as { className?: string }).className === "tooltip-anchor" ? anchor : null }); });
  const tips = renderer!.root.findAll((node) => node.props?.role === "tooltip"); expect(new Set(tips.map((node) => node.props.id)).size).toBe(2); expect(tips.map((node) => node.children.join(""))).toEqual(["First", "Second"]);
  expect(listeners.size).toBe(0);
});
it("retires closed document callbacks and old unmounted anchor callbacks", async () => {
  await mount(); const capturedAnchor = wrapper(); dispatch(capturedAnchor, "onFocus"); const oldKey = [...listeners][0]!;
  dispatch(wrapper(), "onBlur"); dispatch(wrapper(), "onFocus"); escape({}, oldKey); expect(open()).toBe(true);
  const oldFocus = capturedAnchor.props.onFocus; act(() => renderer!.unmount()); renderer = undefined; expect(listeners.size).toBe(0);
  const oldAnchor = anchor; anchor = { ...anchor, contains: (target) => [anchor, trigger, popup, bridge].includes(target as object) };
  await mount(); act(() => oldFocus({ currentTarget: oldAnchor, target: trigger })); escape({}, oldKey); expect(open()).toBe(false);
  dispatch(wrapper(), "onFocus"); expect(open()).toBe(true);
});
