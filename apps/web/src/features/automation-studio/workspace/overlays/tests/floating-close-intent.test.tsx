import React from "react";
import { Blocks } from "lucide-react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OverlayEnvironmentOptions } from "../../../../programs/overlay-environment";
import { AccessibleFloatingOverlay } from "../accessible-floating-overlay";
import { ViewAdderOverlaySubscriber } from "../ViewAdderOverlaySubscriber";
import { LayoutPickerOverlaySubscriber } from "../LayoutPickerOverlaySubscriber";
import { createAutomationStudioOverlayStore } from "../overlay-state-store";
import { createAutomationStudioOverlayController } from "../root-adoption";
import type { ViewAdderOverlayRequest, LayoutPickerOverlayRequest, ViewAdderOverlayCommand, LayoutPickerOverlayCommand } from "../contracts";
import type { OverlayCommandDispatcher } from "../atomic-command";

const instrument = vi.hoisted(() => ({ acquire: vi.fn<(doc: Document, options: OverlayEnvironmentOptions) => () => void>() }));
vi.mock("react-dom", () => ({ createPortal: (children: React.ReactNode) => children }));
vi.mock("../../../../programs/overlay-environment", () => ({ acquireOverlayEnvironment: instrument.acquire }));
let renderer: ReactTestRenderer | undefined;
const anchor = { top: 1, left: 1, right: 10, bottom: 10 };
const adder = (id = "synthetic-a"): ViewAdderOverlayRequest => ({ id, area: "main", anchor, options: [{
  view: { id: "design", label: "Synthetic automation", type: "design", icon: Blocks },
  group: "Flow", groupLabel: "This automation", placement: "Main area", scope: "Synthetic scope", disabledReason: null,
}] });
const picker = (id = "synthetic-layout"): LayoutPickerOverlayRequest => ({ id, area: "main", anchor });
const deferred = () => { let resolve!: () => void; let reject!: (error: unknown) => void; return { promise: new Promise<void>((yes, no) => { resolve = yes; reject = no; }), resolve, reject }; };
const button = (className: string) => renderer!.root.findAllByType("button").find((node) => node.props.className === className)!;
const option = () => button("automation-window-adder-option");
const close = () => renderer!.root.findByProps({ "aria-label": "Close the panel picker" });
const layoutOption = () => renderer!.root.findByProps({ className: "automation-layout-picker-grid" }).findAllByType("button")[0]!;
const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");

function dom() {
  const body = {};
  const doc = { activeElement: body as unknown, body, visibilityState: "visible", focused: true, hasFocus: (): boolean => doc.focused,
    defaultView: { getComputedStyle: (element: { visibility: string }) => ({ visibility: element.visibility }) } };
  function node(tagName: string, attributes: string[] = []) {
    const item = { tagName, ownerDocument: doc as object, isConnected: true, hidden: false, disabled: false, inert: false, visibility: "visible", type: "text", tabIndex: 0, isContentEditable: false, rectangles: [{}],
      matches: (selector: string): boolean => selector === ":disabled" && item.disabled,
      closest: (): object | null => item.inert ? {} : null,
      hasAttribute: (name: string) => attributes.includes(name), getClientRects: () => item.rectangles,
      focus: vi.fn<(options?: FocusOptions) => void>() };
    item.focus.mockImplementation(() => { doc.activeElement = item; });
    return item;
  }
  const trigger = node("BUTTON"); doc.activeElement = trigger;
  const search = node("INPUT", ["autofocus"]), content = node("BUTTON");
  const panel = { ...node("SECTION", ["tabindex"]), scrollHeight: 240,
    contains: (value: unknown) => value === search || value === content,
    querySelectorAll: (selector: string) => selector === "[autofocus]" ? [search] : selector === "[data-autofocus]" ? [] : [content, search] };
  const root = { ...node("DIV"), contains: panel.contains };
  const entries: OverlayEnvironmentOptions[] = [];
  instrument.acquire.mockImplementation((_document, options) => {
    entries.push(options); let released = false;
    return () => {
      if (released) return; released = true;
      const index = entries.indexOf(options), top = index === entries.length - 1; entries.splice(index, 1);
      if (top && (doc.activeElement === body || panel.contains(doc.activeElement))) options.returnFocus?.focus({ preventScroll: true });
    };
  });
  vi.stubGlobal("document", doc);
  return { doc, panel, root, trigger, search, content, body,
    environment: () => instrument.acquire.mock.calls.at(-1)![1],
    createNodeMock: (element: { type: unknown; props: unknown }) => {
      const props = element.props as Record<string, unknown>;
      return element.type === "section" && props.role === "dialog" ? panel : props["data-overlay-root"] ? root : null;
    } };
}
type Dom = ReturnType<typeof dom>;
async function mountAdder(dispatch: OverlayCommandDispatcher<ViewAdderOverlayCommand> = vi.fn(async () => undefined), request = adder()) {
  const state = dom(), store = createAutomationStudioOverlayStore(), controller = createAutomationStudioOverlayController(store);
  controller.viewAdder.open(request);
  await act(async () => { renderer = create(<ViewAdderOverlaySubscriber dispatch={dispatch} store={store} />, { createNodeMock: state.createNodeMock }); });
  return { ...state, store, controller, dispatch };
}
async function mountPicker(dispatch: OverlayCommandDispatcher<LayoutPickerOverlayCommand> = vi.fn(async () => undefined)) {
  const state = dom(), store = createAutomationStudioOverlayStore(), controller = createAutomationStudioOverlayController(store);
  controller.layoutPicker.open(picker());
  await act(async () => { renderer = create(<LayoutPickerOverlaySubscriber dispatch={dispatch} store={store} />, { createNodeMock: state.createNodeMock }); });
  return { ...state, store, controller, dispatch };
}
async function unmount() { await act(async () => renderer!.unmount()); renderer = undefined; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1)); vi.stubGlobal("cancelAnimationFrame", vi.fn()); vi.stubGlobal("ResizeObserver", undefined);
  instrument.acquire.mockReset();
});
afterEach(async () => { if (renderer) await unmount(); vi.unstubAllGlobals(); });

it("returns an eligible trigger once after explicit current Close", async () => {
  const state = await mountAdder(); await act(async () => close().props.onClick());
  expect(state.controller.viewAdder.current()).toBeNull();
  expect(state.trigger.focus).toHaveBeenCalledOnce(); expect(state.trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
});
it.each(["adder", "picker"])("returns an eligible trigger after current %s Escape", async (kind) => {
  const state = kind === "adder" ? await mountAdder() : await mountPicker();
  await act(async () => state.environment().onEscape?.());
  expect(state.trigger.focus).toHaveBeenCalledOnce();
});
it.each(["outside", "teardown"])("does not reclaim source focus after %s", async (reason) => {
  const state = await mountAdder(); state.doc.activeElement = state.body;
  if (reason === "outside") await act(async () => state.environment().onPointerDownOutside?.()); else await unmount();
  expect(state.trigger.focus).not.toHaveBeenCalled();
});
it.each(["adder", "picker"])("accepted %s action closes its request without trigger return", async (kind) => {
  const state = kind === "adder" ? await mountAdder() : await mountPicker();
  state.doc.activeElement = state.body;
  await act(async () => { (kind === "adder" ? option() : layoutOption()).props.onClick(); });
  expect(state.dispatch).toHaveBeenCalledOnce(); expect(state.trigger.focus).not.toHaveBeenCalled();
  expect(kind === "adder" ? state.controller.viewAdder.current() : state.controller.layoutPicker.current()).toBeNull();
});
it("keeps pending cancellation and duplicate activation behind the actual atomic gate", async () => {
  const pending = deferred(), dispatch = vi.fn(() => pending.promise); const state = await mountAdder(dispatch);
  const activate = option().props.onClick, dismiss = close().props.onClick, environment = state.environment();
  await act(async () => { activate(); activate(); dismiss(); environment.onEscape?.(); environment.onPointerDownOutside?.(); });
  expect(dispatch).toHaveBeenCalledOnce(); expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a");
  await act(async () => pending.resolve());
  expect(state.controller.viewAdder.current()).toBeNull(); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("keeps failed actions open with local error and permits retry", async () => {
  const dispatch = vi.fn().mockRejectedValueOnce(new Error("Synthetic failure")).mockResolvedValueOnce(undefined);
  const state = await mountAdder(dispatch); await act(async () => option().props.onClick());
  expect(text(renderer!.root.findByProps({ role: "alert" }))).toBe("Synthetic failure");
  expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a"); expect(state.trigger.focus).not.toHaveBeenCalled();
  await act(async () => option().props.onClick()); expect(dispatch).toHaveBeenCalledTimes(2);
  expect(state.controller.viewAdder.current()).toBeNull(); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("permits current cancellation after a failed action and ignored pending outside/Escape", async () => {
  const pending = deferred(), state = await mountAdder(vi.fn(() => pending.promise));
  const environment = state.environment(), dismiss = close().props.onClick;
  await act(async () => option().props.onClick());
  await act(async () => { environment.onEscape?.(); environment.onPointerDownOutside?.(); dismiss(); });
  expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a");
  await act(async () => pending.reject(new Error("Synthetic refusal")));
  await act(async () => close().props.onClick());
  expect(state.controller.viewAdder.current()).toBeNull(); expect(state.trigger.focus).toHaveBeenCalledOnce();
});
it("preserves acceptance of an issued action across ordinary same-request callback rerenders", async () => {
  const pending = deferred(), dispatch = vi.fn(() => pending.promise), state = await mountAdder(dispatch);
  await act(async () => option().props.onClick());
  const replacement = vi.fn(async () => undefined);
  await act(async () => renderer!.update(<ViewAdderOverlaySubscriber dispatch={replacement} store={state.store} />));
  await act(async () => pending.resolve());
  expect(dispatch).toHaveBeenCalledOnce(); expect(replacement).not.toHaveBeenCalled();
  expect(state.controller.viewAdder.current()).toBeNull(); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("does not publish a retired rejected action into the replacement Surface", async () => {
  const pending = deferred(), dispatch = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined), state = await mountAdder(dispatch);
  await act(async () => option().props.onClick());
  await act(async () => { state.controller.viewAdder.open(adder("replacement")); });
  await act(async () => pending.reject(new Error("Retired synthetic failure")));
  expect(state.controller.viewAdder.current()?.id).toBe("replacement");
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("refuses retired action/query/Close and settled completion through A-B-A replacement", async () => {
  const pending = deferred(), dispatch = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  const state = await mountAdder(dispatch), retiredAction = option().props.onClick, retiredClose = close().props.onClick;
  const retiredQuery = renderer!.root.findByType("input").props.onChange, retiredEnvironment = state.environment();
  await act(async () => retiredAction());
  await act(async () => { state.controller.viewAdder.open(adder("synthetic-b")); });
  await act(async () => { state.controller.viewAdder.open(adder("synthetic-a")); });
  await act(async () => { retiredAction(); retiredClose(); retiredQuery({ target: { value: "retired query" } }); retiredEnvironment.onEscape?.(); retiredEnvironment.onPointerDownOutside?.(); });
  expect(dispatch).toHaveBeenCalledOnce(); expect(renderer!.root.findByType("input").props.value).toBe("");
  expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a");
  await act(async () => pending.resolve());
  expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a"); expect(state.trigger.focus).not.toHaveBeenCalled();
  await act(async () => option().props.onClick()); expect(dispatch).toHaveBeenCalledTimes(2);
  expect(state.controller.viewAdder.current()).toBeNull();
});
it("refuses retired layout dispatch and accepted completion after request replacement", async () => {
  const pending = deferred(), dispatch = vi.fn(() => pending.promise), state = await mountPicker(dispatch);
  const retired = layoutOption().props.onClick; await act(async () => retired());
  await act(async () => { state.controller.layoutPicker.open(picker("new-layout")); });
  await act(async () => retired()); expect(dispatch).toHaveBeenCalledOnce();
  await act(async () => pending.resolve()); expect(state.controller.layoutPicker.current()?.id).toBe("new-layout");
  expect(state.trigger.focus).not.toHaveBeenCalled();
});
it.each(["disconnected", "disabled", "hidden", "inert", "css-hidden", "zero-size", "foreign", "hidden-document", "unfocused"])("does not delegate cancellation focus to an ineligible %s original trigger", async (reason) => {
  const state = await mountAdder();
  if (reason === "disconnected") state.trigger.isConnected = false;
  if (reason === "disabled") state.trigger.disabled = true;
  if (reason === "hidden") state.trigger.hidden = true;
  if (reason === "inert") state.trigger.inert = true;
  if (reason === "css-hidden") state.trigger.visibility = "hidden";
  if (reason === "zero-size") state.trigger.rectangles = [];
  if (reason === "foreign") state.trigger.ownerDocument = {};
  if (reason === "hidden-document") state.doc.visibilityState = "hidden";
  if (reason === "unfocused") state.doc.focused = false;
  await act(async () => close().props.onClick()); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("permits eligible negative-tabindex cancellation triggers", async () => {
  const state = await mountAdder(); state.trigger.tabIndex = -1;
  await act(async () => close().props.onClick()); expect(state.trigger.focus).toHaveBeenCalledOnce();
});
it("rejects disabled view callbacks despite the native button handler being retained", async () => {
  const request = adder(); request.options[0]!.disabledReason = "Synthetic unavailable";
  const state = await mountAdder(undefined, request); await act(async () => option().props.onClick());
  expect(state.dispatch).not.toHaveBeenCalled(); expect(state.controller.viewAdder.current()?.id).toBe(request.id);
});
it("does not cancel during the synchronous dispatch window before busy renders", async () => {
  let dismiss!: () => void;
  const pending = deferred(), dispatch = vi.fn(() => { dismiss(); return pending.promise; });
  const state = await mountAdder(dispatch); dismiss = close().props.onClick;
  await act(async () => option().props.onClick());
  expect(state.controller.viewAdder.current()?.id).toBe("synthetic-a");
  await act(async () => pending.resolve()); expect(state.trigger.focus).not.toHaveBeenCalled();
});
it("supports optional wrapper return predicates while suppressing unknown teardown", async () => {
  const state: Dom = dom(); const shouldReturnFocus = vi.fn(() => false);
  const props = { anchor, ariaLabel: "Synthetic", className: "test", preferredWidth: 320, onClose: vi.fn(), shouldReturnFocus };
  await act(async () => { renderer = create(<AccessibleFloatingOverlay {...props}><button>Content</button></AccessibleFloatingOverlay>, { createNodeMock: state.createNodeMock }); });
  await act(async () => state.environment().onEscape?.()); await unmount();
  expect(state.trigger.focus).not.toHaveBeenCalled();
});
