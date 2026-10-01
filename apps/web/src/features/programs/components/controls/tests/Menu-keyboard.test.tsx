import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { Menu, type MenuOption } from "../Menu";

const environments = vi.hoisted(() => ({ entries: [] as Array<{ returnFocus: { focus(): void } | null; onEscape(): void; onPointerDownOutside(): void }> }));
vi.mock("react-dom", () => ({ createPortal: (children: unknown) => children }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("../../../overlay-environment", () => ({ acquireOverlayEnvironment: (_doc: unknown, options: typeof environments.entries[number]) => { environments.entries.push(options); return () => options.returnFocus?.focus(); } }));
let view: ReactTestRenderer | undefined;
const action = vi.fn();
const defaults: MenuOption[] = [{ id: "a", label: "Alpha", onSelect: action }, { id: "b", label: "Beta", href: "/programs/beta" }, { id: "c", label: "Gamma", onSelect: action }];
const doc = { body: {}, activeElement: null as unknown, visibilityState: "visible", hasFocus: vi.fn(() => true), defaultView: { getComputedStyle: () => ({ visibility: "visible" }) } };
const nodes = new Map<string, ReturnType<typeof makeNode>>();
const label = (children: unknown): string => Array.isArray(children) ? children.map(label).join("") : typeof children === "string" ? children : "";
const items = () => view?.root.findAll(node => typeof node.type === "string" && node.props.role === "menuitem") ?? [];
const item = (id: string) => items().find(node => node.props["data-menu-option"] === id || node.findAllByType("span").some(span => label(span.children) === defaults.find(option => option.id === id)?.label));
function makeNode(id: string) {
  return { ownerDocument: doc, dataset: { menuOption: id }, get isConnected() { return id === "trigger" || Boolean(item(id)); }, get tabIndex() { return item(id)?.props.tabIndex ?? 0; },
    matches: (selector: string) => selector === ":disabled" && Boolean(item(id)?.props.disabled), closest: vi.fn(() => null as unknown),
    getAttribute: (name: string) => name === "aria-disabled" ? item(id)?.props["aria-disabled"]?.toString() ?? null : name === "data-menu-option" ? id : null,
    getClientRects: vi.fn(() => [{}]), focus: vi.fn(() => { doc.activeElement = node(id); item(id)?.props.onFocus?.(); }) };
}
function node(id: string) { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id)!; }
const panel = { ownerDocument: doc, isConnected: true, focus: vi.fn(() => { doc.activeElement = panel; }), contains: (target: unknown) => target === panel || [...nodes.values()].some(value => value === target && value.isConnected && value !== node("trigger")),
  querySelectorAll: () => items().map((entry, index) => node(entry.props["data-menu-option"] ?? defaults[index]!.id)), querySelector: () => items().length ? node(items()[0]!.props["data-menu-option"] ?? "a") : null };
const root = { querySelector: () => node("trigger"), getBoundingClientRect: () => ({ top: 10, bottom: 30, right: 100 }), contains: (target: unknown) => target === node("trigger") };
async function mount(options = defaults, defaultOpen = true, iconOnly = false) {
  vi.stubGlobal("document", doc); vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 }); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); doc.activeElement = node("trigger");
  await act(async () => { view = create(<Menu label="Actions" options={options} defaultOpen={defaultOpen} iconOnly={iconOnly} />, { createNodeMock: element => { const props = element.props as { role?: string; className?: string }; return props.role === "menu" ? panel : props.className === "menu" ? root : null; } }); });
}
const trigger = () => view!.root.findAllByType("button").find(entry => entry.props["aria-haspopup"] === "menu")!;
async function key(value: string, id = "a", extra: Record<string, unknown> = {}) {
  const target = id === "trigger" ? node("trigger") : id === "panel" ? panel : node(id); doc.activeElement = target; const preventDefault = vi.fn();
  const handler = id === "trigger" ? trigger().props.onKeyDown : view!.root.findByProps({ role: "menu" }).props.onKeyDown;
  await act(async () => handler?.({ key: value, target, currentTarget: id === "trigger" ? target : panel, preventDefault, nativeEvent: {}, ...extra })); return preventDefault;
}
async function click(id: string, extra: Record<string, unknown> = {}) { const preventDefault = vi.fn(); await act(async () => item(id)!.props.onClick?.({ currentTarget: node(id), preventDefault, ...extra })); return preventDefault; }
afterEach(async () => { if (view) await act(async () => view!.unmount()); view = undefined; nodes.clear(); environments.entries.length = 0; vi.clearAllMocks(); vi.unstubAllGlobals(); doc.visibilityState = "visible"; doc.hasFocus.mockReturnValue(true); });

it("disabled href is announced without a navigation href or tab stop", async () => {
  await mount(defaults.map(option => option.id === "b" ? { ...option, disabled: true } : option)); const entry = item("b")!;
  expect(entry.props["aria-disabled"]).toBe(true); expect(entry.props.href).toBeUndefined(); expect(entry.props.tabIndex).toBe(-1); expect(node("b").focus).not.toHaveBeenCalled();
});
it.each([false, true])("ArrowUp trigger enters last eligible item (iconOnly=%s)", async iconOnly => {
  await mount(defaults, false, iconOnly); const prevent = await key("ArrowUp", "trigger"); expect(prevent).toHaveBeenCalledOnce(); expect(doc.activeElement).toBe(node("c"));
});
it("ArrowDown trigger enters first eligible item", async () => { await mount(defaults, false); await key("ArrowDown", "trigger"); expect(doc.activeElement).toBe(node("a")); });
it("Tab closes at trigger departure point without preventing native navigation or cleanup reclaim", async () => {
  await mount(); const prevent = await key("Tab"); expect(prevent).not.toHaveBeenCalled(); expect(items()).toHaveLength(0); expect(node("trigger").focus).toHaveBeenCalledOnce();
  const destination = {}; doc.activeElement = destination; expect(environments.entries[0]!.returnFocus).toBeNull(); expect(doc.activeElement).toBe(destination);
});
it("Shift+Tab also departs natively from trigger", async () => { await mount(); expect(await key("Tab", "a", { shiftKey: true })).not.toHaveBeenCalled(); expect(items()).toHaveLength(0); expect(doc.activeElement).toBe(node("trigger")); });
it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { defaultPrevented: true }, { nativeEvent: { isComposing: true } }, { nativeEvent: { keyCode: 229 } }])("navigation preserves native shortcut/composition %j", async extra => {
  await mount(); expect(await key("End", "a", extra)).not.toHaveBeenCalled(); expect(node("c").focus).not.toHaveBeenCalled();
});
it.each(["Enter", " "])("native %s activation is not synthesized by menu keyboard", async value => { await mount(); expect(await key(value)).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled(); await click("a"); expect(action).toHaveBeenCalledOnce(); });
it("removed option's retained callback cannot dispatch", async () => {
  await mount(); const retained = item("a")!.props.onClick; await act(async () => view!.update(<Menu label="Actions" options={defaults.slice(1)} defaultOpen />));
  await act(async () => retained({ preventDefault: vi.fn() })); expect(action).not.toHaveBeenCalled(); expect(items()).toHaveLength(2);
});
it("disabled or replaced option's retained callback cannot dispatch", async () => {
  await mount(); const retained = item("a")!.props.onClick; await act(async () => view!.update(<Menu label="Actions" options={defaults.map(option => option.id === "a" ? { ...option, disabled: true } : option)} defaultOpen />));
  await act(async () => retained({ preventDefault: vi.fn() })); expect(action).not.toHaveBeenCalled();
});
it("same-turn duplicate retained action dispatches once", async () => { await mount(); const retained = item("a")!.props.onClick; await act(async () => { retained({ preventDefault: vi.fn() }); retained({ preventDefault: vi.fn() }); }); expect(action).toHaveBeenCalledOnce(); });
it("caller action exception remains observable and menu still closes", async () => {
  const failure = new Error("synthetic caller error"); const throwing = vi.fn(() => { throw failure; }); await mount([{ id: "a", label: "Alpha", onSelect: throwing }]);
  await act(async () => { expect(() => item("a")!.props.onClick({ preventDefault: vi.fn() })).toThrow(failure); }); expect(items()).toHaveLength(0); expect(environments.entries[0]!.returnFocus).toBeNull();
});
it("enabled Link preserves its href and modified native click", async () => { await mount(); expect(item("b")!.props.href).toBe("/programs/beta"); expect(await click("b", { ctrlKey: true })).not.toHaveBeenCalled(); expect(action).not.toHaveBeenCalled(); });
it("outside pointer close suppresses cleanup trigger return", async () => { await mount(); await act(async () => environments.entries[0]!.onPointerDownOutside()); expect(environments.entries[0]!.returnFocus).toBeNull(); expect(node("trigger").focus).not.toHaveBeenCalled(); });
it("current Escape can return focus to eligible trigger", async () => { await mount(); await act(async () => environments.entries[0]!.onEscape()); expect(doc.activeElement).toBe(node("trigger")); });
it("ArrowUp from panel chooses last rather than penultimate", async () => { await mount(); await key("ArrowUp", "panel"); expect(doc.activeElement).toBe(node("c")); });
it("all disabled entries focus panel", async () => { await mount(defaults.map(option => ({ ...option, disabled: true }))); expect(panel.focus).toHaveBeenCalled(); expect(items().every(entry => entry.props.tabIndex === -1)).toBe(true); });
it.each(["Home", "End", "ArrowDown", "ArrowUp"])("%s moves/wraps with one roving tab stop", async value => {
  await mount(); await key(value, value === "ArrowDown" ? "c" : "a"); const expected = value === "Home" || value === "ArrowDown" ? "a" : "c";
  expect(doc.activeElement).toBe(node(expected)); expect(items().filter(entry => entry.props.tabIndex === 0)).toHaveLength(1); expect(item(expected)!.props.tabIndex).toBe(0);
});
it.each(["hidden", "inert", "zero-size"])("movement excludes %s option", async kind => {
  await mount(); if (kind === "zero-size") node("b").getClientRects.mockReturnValue([]); else node("b").closest.mockReturnValue({});
  await key("ArrowDown"); expect(doc.activeElement).toBe(node("c"));
});
it("options update preserves current focus and roving position", async () => {
  await mount(); await key("End"); const count = node("c").focus.mock.calls.length;
  await act(async () => view!.update(<Menu label="Actions" defaultOpen options={[...defaults]} />)); expect(node("c").focus).toHaveBeenCalledTimes(count); expect(item("c")!.props.tabIndex).toBe(0);
});
it("removed focused item reconciles only while prior source owns focus", async () => {
  await mount(); await key("End"); doc.activeElement = doc.body;
  await act(async () => view!.update(<Menu label="Actions" defaultOpen options={defaults.slice(0, 2)} />)); expect(doc.activeElement).toBe(node("a"));
});
it("options update never steals an outside control's focus", async () => {
  await mount(); await key("End"); const outside = { isConnected: true }; doc.activeElement = outside;
  await act(async () => view!.update(<Menu label="Actions" defaultOpen options={defaults.slice(0, 2)} />)); expect(doc.activeElement).toBe(outside);
});
it.each(["hidden", "unfocused", "foreign-focus", "foreign-target"])("Tab refuses %s event ownership", async kind => {
  await mount(); const handler = view!.root.findByProps({ role: "menu" }).props.onKeyDown; const target = node("a"); doc.activeElement = kind === "foreign-focus" ? {} : target;
  if (kind === "hidden") doc.visibilityState = "hidden"; if (kind === "unfocused") doc.hasFocus.mockReturnValue(false);
  await act(async () => handler({ key: "Tab", nativeEvent: {}, target: kind === "foreign-target" ? {} : target, currentTarget: panel, preventDefault: vi.fn() }));
  expect(items()).toHaveLength(3); expect(node("trigger").focus).not.toHaveBeenCalled();
});
it("old generation action cannot act on reopened menu", async () => {
  await mount(); const retained = item("a")!.props.onClick; await key("Tab"); await act(async () => trigger().props.onClick());
  await act(async () => retained({ preventDefault: vi.fn() })); expect(action).not.toHaveBeenCalled(); expect(items()).toHaveLength(3);
});
it("retired keyboard callbacks and teardown never reclaim focus", async () => {
  await mount(); const handler = view!.root.findByProps({ role: "menu" }).props.onKeyDown; await act(async () => view!.unmount()); view = undefined;
  handler({ key: "Tab", nativeEvent: {}, target: node("a"), currentTarget: panel, preventDefault: vi.fn() }); expect(node("trigger").focus).not.toHaveBeenCalled(); expect(environments.entries[0]!.returnFocus).toBeNull();
});
it("Escape close does not reclaim an already moved outside focus", async () => {
  await mount(); const outside = { isConnected: true }; doc.activeElement = outside; await act(async () => environments.entries[0]!.onEscape()); expect(doc.activeElement).toBe(outside); expect(node("trigger").focus).not.toHaveBeenCalled();
});
it("action-owned finally cannot close a synchronously reopened menu", async () => {
  const reopen = vi.fn(() => { act(() => trigger().props.onClick()); act(() => trigger().props.onClick()); });
  await mount([{ id: "a", label: "Alpha", onSelect: reopen }]); const activate = item("a")!.props.onClick;
  activate({ preventDefault: vi.fn() }); expect(reopen).toHaveBeenCalledOnce(); expect(items()).toHaveLength(1); expect(environments.entries).toHaveLength(2);
});
