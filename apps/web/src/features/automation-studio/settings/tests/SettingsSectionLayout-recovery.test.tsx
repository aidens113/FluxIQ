import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Settings } from "lucide-react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsSectionLayout, type SettingsSectionDefinition } from "../SettingsSectionLayout";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer | undefined;
let serial: number;
let frames: Map<number, FrameRequestCallback>;
let cancelled: Set<number>;
const definitions = (ids: string[]): SettingsSectionDefinition[] => ids.map(id => ({ id, label: id, description: id, icon: Settings }));
beforeEach(() => {
  serial = 0; frames = new Map(); cancelled = new Set();
  vi.stubGlobal("window", {
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: (id: number) => { cancelled.add(id); }
  });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
async function fixture(active = "a", ids = ["a", "b"], change = vi.fn()) {
  const positions = new Map<string, number>([["a", 10], ["b", 100], ["c", 20], ["d", 150]]);
  const container = {
    scrollTop: 0, scrollHeight: 1000, clientHeight: 200,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelector: (selector: string) => positions.has(selector.slice(1)) ? { getBoundingClientRect: () => ({ top: positions.get(selector.slice(1))! }) } : null,
    scrollTo: vi.fn()
  };
  const navigation = {
    scrollTop: 0, scrollLeft: 0, scrollTo: vi.fn(),
    getBoundingClientRect: () => ({ top: 0, bottom: 50, left: 0, right: 100 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 80, bottom: 100, left: 0, right: 100 }) })
  };
  const render = (selected: string, sections: string[], callback: (id: string) => void) => createElement(SettingsSectionLayout, {
    activeSection: selected, sections: definitions(sections), onActiveSectionChange: callback, ariaLabel: "Synthetic sections", children: null
  });
  await act(async () => { renderer = create(render(active, ids, change), { createNodeMock: element => element.type === "nav" ? navigation : (element.props as { className?: string }).className === "automation-settings-content" ? container : null }); });
  return {
    container, navigation, positions, change,
    update: async (selected: string, sections: string[], callback: (id: string) => void) => { await act(async () => renderer!.update(render(selected, sections, callback))); },
    scroll: () => renderer!.root.findByProps({ className: "automation-settings-content" }).props.onScroll({ currentTarget: container })
  };
}
async function flush() {
  const pending = [...frames]; frames.clear();
  await act(async () => { for (const [id, callback] of pending) if (!cancelled.has(id)) callback(0); });
}
it("uses latest sections and callback for already queued scroll geometry", async () => {
  const state = await fixture(); await flush(); const latest = vi.fn();
  state.scroll(); await state.update("d", ["c", "d"], latest); await flush();
  expect(state.change).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce(); expect(latest).toHaveBeenCalledWith("c");
});
it("does not notify when latest selection already matches queued visible geometry", async () => {
  const state = await fixture("b"); await flush(); state.scroll();
  await state.update("a", ["a", "b"], state.change); await flush(); expect(state.change).not.toHaveBeenCalled();
});
it("reschedules initial content scrolling when selection changes before first frame", async () => {
  const state = await fixture(); await state.update("b", ["a", "b"], state.change); await flush();
  expect(state.container.scrollTo).toHaveBeenCalledOnce(); expect(state.container.scrollTo).toHaveBeenCalledWith({ top: 84, behavior: "auto" });
});
it("keeps completed initialization once while preserving explicit click and native relationships", async () => {
  const state = await fixture(); await flush(); state.container.scrollTo.mockClear();
  await state.update("b", ["a", "b"], state.change); await flush(); expect(state.container.scrollTo).not.toHaveBeenCalled();
  const buttons = renderer!.root.findAllByType("button");
  expect(buttons[1]!.props).toMatchObject({ type: "button", "aria-controls": "b", "aria-current": "location" });
  expect(buttons[1]!.props.onKeyDown).toBeUndefined();
  expect(renderer!.root.findByProps({ className: "automation-settings-content" }).props.tabIndex).toBe(0);
  await act(async () => buttons[1]!.props.onClick());
  expect(state.change).toHaveBeenCalledWith("b"); expect(state.container.scrollTo).toHaveBeenCalledWith({ top: 84, behavior: "auto" });
  expect(state.navigation.scrollTo).toHaveBeenCalledWith({ top: 50, left: 0, behavior: "auto" });
});
it("supersedes cancelled scroll frames even if their callbacks are retained", async () => {
  const state = await fixture("b"); await flush(); state.scroll(); const stale = frames.get(serial)!;
  state.scroll(); await act(async () => stale(0)); expect(state.change).not.toHaveBeenCalled();
  await flush(); expect(state.change).toHaveBeenCalledOnce(); expect(state.change).toHaveBeenCalledWith("a");
});
it("retires queued and retained scroll/click handlers on unmount", async () => {
  const state = await fixture("b"); await flush(); state.scroll(); const retained = frames.get(serial)!;
  const click = renderer!.root.findAllByType("button")[0]!.props.onClick;
  const retainedScroll = renderer!.root.findByProps({ className: "automation-settings-content" }).props.onScroll;
  await act(async () => renderer!.unmount()); renderer = undefined;
  state.container.scrollTo.mockClear(); const before = serial;
  await act(async () => { retained(0); retainedScroll({ currentTarget: state.container }); click(); });
  expect(state.change).not.toHaveBeenCalled(); expect(state.container.scrollTo).not.toHaveBeenCalled(); expect(serial).toBe(before);
});
it("does not run cancelled initialization even through a retained callback", async () => {
  const state = await fixture(); const retired = frames.get(1)!;
  await state.update("b", ["a", "b"], state.change);
  await act(async () => retired(0)); expect(state.container.scrollTo).not.toHaveBeenCalled();
  await flush(); expect(state.container.scrollTo).toHaveBeenCalledOnce(); expect(state.container.scrollTo).toHaveBeenCalledWith({ top: 84, behavior: "auto" });
});
it("uses latest callback for retained current buttons but refuses removed sections", async () => {
  const state = await fixture(); await flush(); const clicks = renderer!.root.findAllByType("button").map(button => button.props.onClick);
  const latest = vi.fn(); await state.update("a", ["a", "c"], latest); state.container.scrollTo.mockClear();
  await act(async () => clicks[1]()); expect(latest).not.toHaveBeenCalled(); expect(state.container.scrollTo).not.toHaveBeenCalled();
  await act(async () => clicks[0]()); expect(state.change).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledWith("a");
});
it("refuses geometry events from a foreign container", async () => {
  const state = await fixture("b"); await flush(); const before = serial;
  const handler = renderer!.root.findByProps({ className: "automation-settings-content" }).props.onScroll;
  handler({ currentTarget: { ...state.container } }); expect(serial).toBe(before);
});

