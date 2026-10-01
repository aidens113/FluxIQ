import { afterEach, expect, it, vi } from "vitest";
import { acquireOverlayEnvironment, overlayEnvironmentDepth, overlayEnvironmentListenerCount, type OverlayEnvironmentMode } from "../overlay-environment";

const releases: Array<() => void> = [];
afterEach(() => { releases.splice(0).reverse().forEach(release => release()); });
function fixture() {
  const listeners = new Map<string, EventListener>();
  const state = { activeElement: null as unknown, visibilityState: "visible", hasFocus: vi.fn(() => true),
    addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)), removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    defaultView: { addEventListener: vi.fn(), removeEventListener: vi.fn(), getComputedStyle: (element: { visibility: string }) => ({ visibility: element.visibility }) } };
  const document = state as unknown as Document;
  class Node {
    ownerDocument = document; parent: Node | null = null; children: Node[] = []; candidates: Node[] = [];
    isConnected = true; hidden = false; inert = false; disabled = false; type = "text"; tabIndex = 0; visibility = "visible"; rendered = true;
    attributes = new Map<string, string>(); style = { overflow: "auto" }; tagName = "BUTTON";
    focus = vi.fn(() => { state.activeElement = this; });
    constructor(readonly id: string) {}
    matches(selector: string) { return selector === ":disabled" && this.disabled; }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    closest(_selector: string): Node | null { let current: Node | null = this; while (current) { if (current.hidden || current.inert || current.getAttribute("aria-hidden") === "true") return current; current = current.parent; } return null; }
    contains(target: unknown): boolean { return target === this || this.children.some(child => child.contains(target)); }
    querySelectorAll() { return this.candidates; }
    getClientRects() { return this.rendered ? [{}] : []; }
  }
  const node = (id: string) => new Node(id);
  const attach = (parent: Node, child: Node) => { parent.children.push(child); child.parent = parent; child.isConnected = true; return child; };
  const body = node("body"); body.tagName = "BODY"; body.tabIndex = -1;
  Object.assign(state, { body }); state.activeElement = body;
  const background = attach(body, node("background")); const trigger = attach(background, node("trigger"));
  const panel = attach(body, node("panel")); panel.tabIndex = -1; const a = attach(panel, node("a")); const b = attach(panel, node("b")); panel.candidates = [a, b];
  function acquire(returnFocus: Parameters<typeof acquireOverlayEnvironment>[1]["returnFocus"] = trigger, mode: OverlayEnvironmentMode = "modal", currentPanel = panel) {
    const options = { panel: currentPanel as unknown as HTMLElement, root: currentPanel as unknown as HTMLElement, mode, returnFocus, trapFocus: mode === "modal", onEscape: vi.fn(), canDismiss: vi.fn(() => true) };
    const release = acquireOverlayEnvironment(document, options); releases.push(release); return { options, release };
  }
  function key(key: string, extra: Record<string, unknown> = {}) {
    const event = { key, target: state.activeElement, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
    listeners.get("keydown")?.(event as unknown as Event); return event;
  }
  return { state, document, node, body, background, trigger, panel, a, b, attach, acquire, key, listeners };
}

it.each([{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }])("capture Escape preserves handled/native input %j", extra => {
  const f = fixture(); const lease = f.acquire(); const event = f.key("Escape", extra); expect(lease.options.onEscape).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
});
it("ordinary Escape dismisses only current top and observes busy", () => {
  const f = fixture(); const lower = f.acquire(); const top = f.acquire(null, "menu"); f.key("Escape"); expect(top.options.onEscape).toHaveBeenCalledOnce(); expect(lower.options.onEscape).not.toHaveBeenCalled(); top.options.canDismiss.mockReturnValue(false); f.key("Escape"); expect(top.options.onEscape).toHaveBeenCalledOnce();
});
it.each(["hidden-document", "unfocused-document", "disconnected", "hidden-panel", "inert-panel"])("Escape refuses %s foreground", kind => {
  const f = fixture(); const lease = f.acquire(); if (kind === "hidden-document") f.state.visibilityState = "hidden"; if (kind === "unfocused-document") f.state.hasFocus.mockReturnValue(false);
  if (kind === "disconnected") f.panel.isConnected = false; if (kind === "hidden-panel") f.panel.hidden = true; if (kind === "inert-panel") f.panel.inert = true;
  expect(f.key("Escape").preventDefault).not.toHaveBeenCalled(); expect(lease.options.onEscape).not.toHaveBeenCalled();
});
it.each(["hidden-input", "hidden", "aria-hidden", "ancestor-hidden", "ancestor-inert", "ancestor-aria", "visibility-hidden", "visibility-collapse", "zero-size", "disconnected", "disabled", "fieldset-disabled", "tab-negative1", "tab-negative2", "foreign-document"])("Tab candidate excludes %s", kind => {
  const f = fixture(); f.acquire(); if (kind === "hidden-input") { f.b.tagName = "INPUT"; f.b.type = "hidden"; }
  if (kind === "hidden") f.b.hidden = true; if (kind === "aria-hidden") f.b.setAttribute("aria-hidden", "true");
  if (kind.startsWith("ancestor-")) { const ancestor = f.node("ancestor"); f.panel.children = [f.a, ancestor]; ancestor.parent = f.panel; f.attach(ancestor, f.b); ancestor.hidden = kind === "ancestor-hidden"; ancestor.inert = kind === "ancestor-inert"; if (kind === "ancestor-aria") ancestor.setAttribute("aria-hidden", "true"); }
  if (kind.startsWith("visibility-")) f.b.visibility = kind === "visibility-hidden" ? "hidden" : "collapse";
  if (kind === "zero-size") f.b.rendered = false; if (kind === "disconnected") f.b.isConnected = false;
  if (kind === "disabled" || kind === "fieldset-disabled") f.b.disabled = true;
  if (kind.startsWith("tab-negative")) f.b.tabIndex = kind === "tab-negative1" ? -1 : -2;
  if (kind === "foreign-document") f.b.ownerDocument = {} as Document;
  f.state.activeElement = f.a; f.key("Tab", { shiftKey: true }); expect(f.b.focus).not.toHaveBeenCalled(); expect(f.a.focus).toHaveBeenCalledOnce();
});
it("effective first-legend control remains sequentially eligible", () => {
  const f = fixture(); const fieldset = f.node("fieldset"); fieldset.disabled = true; const legend = f.node("legend"); f.panel.children = [f.a, fieldset]; fieldset.parent = f.panel; f.attach(fieldset, legend); f.attach(legend, f.b); f.b.disabled = false; f.acquire(); f.state.activeElement = f.a; f.key("Tab", { shiftKey: true }); expect(f.b.focus).toHaveBeenCalledOnce();
});
it.each([false, true])("panel Tab enters directional endpoint shift=%s", shiftKey => { const f = fixture(); f.acquire(); f.state.activeElement = f.panel; expect(f.key("Tab", { shiftKey }).preventDefault).toHaveBeenCalledOnce(); expect((shiftKey ? f.b : f.a).focus).toHaveBeenCalledOnce(); });
it("body after removed source enters first", () => { const f = fixture(); f.acquire(); f.state.activeElement = f.body; expect(f.key("Tab").preventDefault).toHaveBeenCalledOnce(); expect(f.a.focus).toHaveBeenCalledOnce(); });
it("owned newly disabled source uses directional fallback", () => { const f = fixture(); f.acquire(); f.b.disabled = true; f.state.activeElement = f.b; f.key("Tab", { shiftKey: true }); expect(f.a.focus).toHaveBeenCalledOnce(); });
it("valid middle traversal stays native and endpoints wrap", () => {
  const f = fixture(); const middle = f.attach(f.panel, f.node("middle")); f.panel.candidates = [f.a, middle, f.b]; f.acquire(); f.state.activeElement = middle; expect(f.key("Tab").preventDefault).not.toHaveBeenCalled();
  f.state.activeElement = f.b; f.key("Tab"); expect(f.a.focus).toHaveBeenCalledOnce(); f.state.activeElement = f.a; f.key("Tab", { shiftKey: true }); expect(f.b.focus).toHaveBeenCalledOnce();
});
it.each([{ defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }])("Tab preserves native input %j", extra => { const f = fixture(); f.acquire(); f.state.activeElement = f.b; expect(f.key("Tab", extra).preventDefault).not.toHaveBeenCalled(); expect(f.a.focus).not.toHaveBeenCalled(); });
it("no eligible candidates focus panel", () => { const f = fixture(); f.panel.candidates = []; f.acquire(); f.state.activeElement = f.panel; f.key("Tab"); expect(f.panel.focus).toHaveBeenCalledOnce(); });
it("unrelated connected current focus and stale target are preserved", () => {
  const f = fixture(); f.acquire(); f.state.activeElement = f.trigger; expect(f.key("Tab").preventDefault).not.toHaveBeenCalled();
  f.state.activeElement = f.b; expect(f.key("Tab", { target: f.trigger }).preventDefault).not.toHaveBeenCalled(); expect(f.a.focus).not.toHaveBeenCalled();
});
it("top menu leaves underlying trap untouched", () => { const f = fixture(); f.acquire(); f.acquire(null, "menu"); f.state.activeElement = f.b; expect(f.key("Tab").preventDefault).not.toHaveBeenCalled(); expect(f.a.focus).not.toHaveBeenCalled(); });
it.each(["hidden-document", "unfocused-document", "hidden", "inert", "disabled", "fieldset-disabled", "zero-size", "visibility-hidden", "foreign-document", "disconnected"])("return target refuses %s", kind => {
  const f = fixture(); const lease = f.acquire(); f.state.activeElement = f.a;
  if (kind === "hidden-document") f.state.visibilityState = "hidden"; if (kind === "unfocused-document") f.state.hasFocus.mockReturnValue(false);
  if (kind === "hidden") f.trigger.hidden = true; if (kind === "inert") f.trigger.inert = true; if (kind === "disabled" || kind === "fieldset-disabled") f.trigger.disabled = true;
  if (kind === "zero-size") f.trigger.rendered = false; if (kind === "visibility-hidden") f.trigger.visibility = "hidden"; if (kind === "foreign-document") f.trigger.ownerDocument = {} as Document; if (kind === "disconnected") f.trigger.isConnected = false;
  lease.release(); expect(f.trigger.focus).not.toHaveBeenCalled(); expect(overlayEnvironmentDepth(f.document)).toBe(0); expect(f.body.style.overflow).toBe("auto");
});
it("release never reclaims a moved connected focus", () => { const f = fixture(); const lease = f.acquire(); const outside = f.attach(f.background, f.node("outside")); f.state.activeElement = outside; lease.release(); expect(f.trigger.focus).not.toHaveBeenCalled(); expect(f.state.activeElement).toBe(outside); });
it("negative-tabindex programmatic return remains allowed", () => { const f = fixture(); f.trigger.tabIndex = -1; const lease = f.acquire(); f.state.activeElement = f.a; lease.release(); expect(f.trigger.focus).toHaveBeenCalledWith({ preventScroll: true }); });
it("original minimal focus proxies remain compatible", () => { const f = fixture(); const focus = vi.fn(); f.acquire({ focus, isConnected: true }).release(); expect(focus).toHaveBeenCalledOnce(); f.acquire({ focus, isConnected: false }).release(); expect(focus).toHaveBeenCalledOnce(); });
it("nested release restores underlying focus without scroll/listener loss", () => {
  const f = fixture(); const lower = f.acquire(); const nested = f.attach(f.body, f.node("nested")); const child = f.attach(nested, f.node("child")); const top = f.acquire(f.a, "modal", nested); f.state.activeElement = child;
  top.release(); expect(f.a.focus).toHaveBeenCalledOnce(); expect(f.body.style.overflow).toBe("hidden"); expect(f.state.removeEventListener).not.toHaveBeenCalled(); lower.release(); expect(f.trigger.focus).toHaveBeenCalledOnce(); expect(f.state.removeEventListener).toHaveBeenCalledTimes(4); expect(f.state.defaultView.removeEventListener).toHaveBeenCalledTimes(2);
});
it("lower release cannot steal newer focus and remains idempotent", () => { const f = fixture(); const lower = f.acquire(); const top = f.acquire(null, "menu"); f.state.activeElement = f.b; lower.release(); lower.release(); expect(f.trigger.focus).not.toHaveBeenCalled(); expect(f.state.activeElement).toBe(f.b); expect(overlayEnvironmentDepth(f.document)).toBe(1); top.release(); expect(overlayEnvironmentListenerCount(f.document)).toBe(0); });
it("explicit return suppression retains original isolation and cleanup", () => {
  const f = fixture(); f.background.setAttribute("aria-hidden", "false"); f.background.inert = true; const lease = f.acquire(); lease.options.returnFocus = null; lease.release(); lease.release(); expect(f.trigger.focus).not.toHaveBeenCalled(); expect(f.background.getAttribute("aria-hidden")).toBe("false"); expect(f.background.inert).toBe(true); expect(f.body.style.overflow).toBe("auto"); expect(f.state.removeEventListener).toHaveBeenCalledTimes(4);
});
it.each(["hidden", "unfocused"])("Tab never moves focus in %s document", kind => { const f = fixture(); f.acquire(); f.state.activeElement = f.b; if (kind === "hidden") f.state.visibilityState = "hidden"; else f.state.hasFocus.mockReturnValue(false); expect(f.key("Tab").preventDefault).not.toHaveBeenCalled(); expect(f.a.focus).not.toHaveBeenCalled(); });
it("top return cannot focus a target still isolated by underlying modal", () => {
  const f = fixture(); f.acquire(); const nested = f.attach(f.body, f.node("nested")); const child = f.attach(nested, f.node("child")); const top = f.acquire(f.trigger, "modal", nested); f.state.activeElement = child;
  top.release(); expect(f.trigger.focus).not.toHaveBeenCalled(); expect(f.background.inert).toBe(true); expect(f.body.style.overflow).toBe("hidden");
});
it("retained capture handler after final release cannot dismiss or trap", () => {
  const f = fixture(); const lease = f.acquire(); const handler = f.listeners.get("keydown")!; lease.release(); const preventDefault = vi.fn(); handler({ key: "Escape", preventDefault } as unknown as Event); expect(lease.options.onEscape).not.toHaveBeenCalled(); expect(preventDefault).not.toHaveBeenCalled(); expect(f.listeners.size).toBe(0);
});
it("minimal proxy may omit optional connectivity flag", () => { const f = fixture(); const focus = vi.fn(); f.acquire({ focus }).release(); expect(focus).toHaveBeenCalledOnce(); });
it("new body sibling isolation is reapplied on actual acquisition without an observer", () => {
  const f = fixture(); f.acquire(); const later = f.attach(f.body, f.node("later")); expect(later.inert).toBe(false); const allowed = f.attach(f.body, f.node("allowed")); f.acquire(null, "nonmodal", allowed); expect(later.inert).toBe(true); expect(allowed.inert).toBe(false);
});
