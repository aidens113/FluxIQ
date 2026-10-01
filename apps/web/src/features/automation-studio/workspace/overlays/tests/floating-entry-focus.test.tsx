import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessibleFloatingOverlay } from "../accessible-floating-overlay";
import type { OverlayEnvironmentOptions } from "../../../../programs/overlay-environment";

const fixture = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
vi.mock("react-dom", () => ({ createPortal: (children: React.ReactNode) => children }));
vi.mock("../../../../programs/overlay-environment", () => ({ acquireOverlayEnvironment: fixture.acquire }));
let renderer: ReactTestRenderer | undefined;
function setup(invalid = "", state: "visible" | "hidden" | "unfocused" = "visible") {
  const foreignTrigger = { focus: vi.fn() };
  const doc = {
    activeElement: null as unknown, visibilityState: state === "hidden" ? "hidden" : "visible", hasFocus: () => state !== "unfocused",
    defaultView: { getComputedStyle: (element: { invalid: string }) => ({ visibility: element.invalid === "css-hidden" ? "hidden" : element.invalid === "css-collapse" ? "collapse" : "visible" }) },
  };
  function candidate(tagName: string, attributes: string[] = [], reason = "") {
    return { tagName, attributes, invalid: reason, ownerDocument: reason === "foreign-document" ? {} : doc, isConnected: reason !== "disconnected", hidden: reason === "hidden-self",
      type: reason === "hidden-input" ? "hidden" : "text", isContentEditable: false, tabIndex: 0,
      hasAttribute: (name: string) => attributes.includes(name),
      matches: (selector: string) => selector === ":disabled" && ["disabled", "fieldset"].includes(reason),
      closest: () => ["hidden", "inert", "aria-hidden"].includes(reason) ? {} : null,
      getClientRects: () => reason === "zero-size" ? [] : [{}], focus: vi.fn() };
  }
  const trigger = candidate("BUTTON"); doc.activeElement = trigger;
  const close = candidate("BUTTON", [], invalid === "all-invalid" ? "disabled" : "");
  const explicit = candidate(invalid === "nonfocusable" ? "DIV" : "INPUT", ["autofocus"], invalid === "all-invalid" ? "disabled" : invalid);
  const ordinary = candidate("INPUT", [], invalid === "all-invalid" ? "disabled" : "");
  const all = [close, explicit, ordinary];
  const matches = (item: ReturnType<typeof candidate>, selector: string) => selector.split(",").some((part) => {
    if (part === "[autofocus]" || part === "[data-autofocus]") return item.attributes.includes(part.slice(1, -1));
    return part.startsWith(item.tagName.toLowerCase()) || (part.startsWith("[tabindex]") && item.hasAttribute("tabindex"));
  });
  const panel = { ...candidate("SECTION", ["tabindex"]), scrollHeight: 240,
    querySelector: (selector: string) => all.find((item) => matches(item, selector)) ?? null,
    querySelectorAll: (selector: string) => all.filter((item) => matches(item, selector)),
  };
  const root = { isConnected: true, ownerDocument: doc };
  vi.stubGlobal("document", { body: {}, activeElement: foreignTrigger });
  return { panel, root, doc, close, explicit, ordinary, trigger, foreignTrigger };
}
async function mount(state: ReturnType<typeof setup>) {
  await act(async () => { renderer = create(<AccessibleFloatingOverlay anchor={{ top: 1, left: 1, right: 10, bottom: 10 }} ariaLabel="Add a view" className="synthetic-overlay" preferredWidth={320} onClose={() => undefined}>
    <button type="button">Close</button><input autoFocus placeholder="Search available views" /><input placeholder="Other content" />
  </AccessibleFloatingOverlay>, { createNodeMock: (element) => element.type === "section" ? state.panel : (element.props as { "data-overlay-root"?: string })["data-overlay-root"] ? state.root : null }); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("HTMLElement", class {});
  fixture.acquire.mockReset().mockReturnValue(fixture.release);
  fixture.release.mockReset();
});
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });

it("focuses the actual explicit search input before the earlier heading Close", async () => {
  const state = setup(); await mount(state);
  expect(state.explicit.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(state.close.focus).not.toHaveBeenCalled();
});
it.each(["disabled", "fieldset", "hidden", "hidden-self", "inert", "aria-hidden", "hidden-input", "zero-size", "disconnected", "css-hidden", "css-collapse", "nonfocusable", "foreign-document"])("rejects %s autofocus candidates before falling back to eligible ordinary content", async (invalid) => {
  const state = setup(invalid); state.close.invalid = "disabled";
  state.close.matches = () => true;
  await mount(state);
  expect(state.explicit.focus).not.toHaveBeenCalled();
  expect(state.ordinary.focus).toHaveBeenCalledWith({ preventScroll: true });
});
it("uses the panel owner document and its active element for environment registration", async () => {
  const state = setup();
  fixture.acquire.mockImplementation((_document: Document, options: OverlayEnvironmentOptions) => () => options.returnFocus?.focus({ preventScroll: true }));
  await mount(state);
  expect(fixture.acquire).toHaveBeenCalledWith(state.doc, expect.objectContaining({ panel: state.panel, root: state.root, mode: "nonmodal" }));
  const options = fixture.acquire.mock.calls[0]![1] as OverlayEnvironmentOptions;
  expect(options.returnFocus?.isConnected).toBe(true);
  await act(async () => options.onEscape?.());
  await act(async () => renderer!.unmount()); renderer = undefined;
  expect(state.trigger.focus).toHaveBeenCalledOnce(); expect(state.trigger.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(state.foreignTrigger.focus).not.toHaveBeenCalled();
});
it("rechecks original owner-document trigger eligibility at cancellation release", async () => {
  const state = setup();
  fixture.acquire.mockImplementation((_document: Document, options: OverlayEnvironmentOptions) => () => options.returnFocus?.focus({ preventScroll: true }));
  await mount(state);
  const options = fixture.acquire.mock.calls[0]![1] as OverlayEnvironmentOptions;
  await act(async () => options.onEscape?.());
  state.trigger.hidden = true;
  await act(async () => renderer!.unmount()); renderer = undefined;
  expect(state.trigger.focus).not.toHaveBeenCalled(); expect(state.foreignTrigger.focus).not.toHaveBeenCalled();
});
it("prefers data-autofocus over native autofocus regardless of DOM order", async () => {
  const state = setup(); state.ordinary.attributes.push("data-autofocus"); await mount(state);
  expect(state.ordinary.focus).toHaveBeenCalledOnce(); expect(state.explicit.focus).not.toHaveBeenCalled();
});
it("falls through invalid data-autofocus to eligible native autofocus before heading controls", async () => {
  const state = setup("disabled"); state.explicit.attributes.push("data-autofocus"); state.ordinary.attributes.push("autofocus");
  await mount(state);
  expect(state.ordinary.focus).toHaveBeenCalledOnce();
  expect(state.explicit.focus).not.toHaveBeenCalled(); expect(state.close.focus).not.toHaveBeenCalled();
});
it("falls back to an eligible ordinary heading control when explicit autofocus is invalid", async () => {
  const state = setup("disabled"); await mount(state);
  expect(state.close.focus).toHaveBeenCalledOnce(); expect(state.explicit.focus).not.toHaveBeenCalled();
});
it("falls back to the panel when every content control is ineligible", async () => {
  const state = setup("all-invalid"); await mount(state);
  expect(state.panel.focus).toHaveBeenCalledWith({ preventScroll: true });
  for (const item of [state.close, state.explicit, state.ordinary]) expect(item.focus).not.toHaveBeenCalled();
});
it.each(["hidden", "unfocused"] as const)("does not claim entry focus in a %s owner document", async (visibility) => {
  const state = setup("", visibility); await mount(state);
  expect(fixture.acquire).toHaveBeenCalledOnce();
  for (const item of [state.panel, state.close, state.explicit, state.ordinary]) expect(item.focus).not.toHaveBeenCalled();
});
it("does not focus a retired disconnected panel and cleans its acquired environment", async () => {
  const state = setup(); fixture.acquire.mockImplementation(() => { state.panel.isConnected = false; return fixture.release; });
  await mount(state);
  for (const item of [state.panel, state.close, state.explicit, state.ordinary]) expect(item.focus).not.toHaveBeenCalled();
  await act(async () => renderer!.unmount()); renderer = undefined;
  expect(fixture.release).toHaveBeenCalledOnce();
});
it.each(["hidden", "inert", "css-hidden", "zero-size"])("does not focus content within an ineligible %s panel", async (reason) => {
  const state = setup();
  if (reason === "hidden") state.panel.hidden = true;
  if (reason === "inert") state.panel.closest = () => ({});
  if (reason === "css-hidden") state.panel.invalid = reason;
  if (reason === "zero-size") state.panel.getClientRects = () => [];
  await mount(state);
  for (const item of [state.panel, state.close, state.explicit, state.ordinary]) expect(item.focus).not.toHaveBeenCalled();
});
