import { readdirSync, readFileSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAutomationWorkspacePrefs } from "../layout/defaults";
import { createAutomationWorkspaceRenderStore } from "../render-store";
import { createAutomationWorkspaceCommandPort } from "../commands/port";
import { createAutomationWarmViewRegistry } from "../commands/warm-activation";
import { createAutomationWorkspaceCommands } from "../commands/workspace-commands";
import { AutomationPaneArea } from "./PaneArea";
import { startAutomationSplitResize } from "./pane-interactions";
import { AutomationNarrowScrollRegion } from "./ResponsiveDrawers";
import { beginAutomationSectionResize } from "./resize-events";
import {
  automationWorkspaceMaxSubscribedViews,
  boundedAutomationWorkspaceViewIds,
  createAutomationWorkspaceViewSource
} from "./view-source";
import { observeAutomationWorkspaceSelector } from "./selectors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Phase 8 workspace shell", () => {
  it("notifies only selectors whose selected workspace value changed", () => {
    const store = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
    const activeViewListener = vi.fn();
    const widthListener = vi.fn();
    const unsubscribeActive = observeAutomationWorkspaceSelector(store, (prefs) => prefs.activeViewId, activeViewListener);
    const unsubscribeWidth = observeAutomationWorkspaceSelector(store, (prefs) => prefs.inspectorWidth, widthListener);

    store.replace({ ...store.getPrefs(), inspectorWidth: 388 });

    expect(widthListener).toHaveBeenCalledOnce();
    expect(widthListener).toHaveBeenCalledWith(388);
    expect(activeViewListener).not.toHaveBeenCalled();

    unsubscribeActive();
    unsubscribeWidth();
  });

  it("isolates per-view publications from unrelated subscribers", () => {
    const source = createAutomationWorkspaceViewSource();
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = source.subscribe("first", first);
    const unsubscribeSecond = source.subscribe("second", second);

    source.replace("first", { marker: "first" } as never);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    source.replace("second", { marker: "second" } as never);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    unsubscribeFirst();
    unsubscribeSecond();
  });

  it("bounds subscription preparation while retaining the active persisted view", () => {
    const ids = Array.from({ length: 5_000 }, (_, index) => "view-" + index);
    let indexedReads = 0;
    const observed = new Proxy(ids, {
      get(target, property, receiver) {
        if (typeof property === "string" && /^\d+$/.test(property)) indexedReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    const bounded = boundedAutomationWorkspaceViewIds(observed, "view-4999");

    expect(bounded).toHaveLength(automationWorkspaceMaxSubscribedViews);
    expect(bounded).toContain("view-4999");
    expect(indexedReads).toBeLessThanOrEqual(automationWorkspaceMaxSubscribedViews * 2);
  });

  it("gives narrow drawers an explicit bounded scroll region", () => {
    const html = renderToStaticMarkup(
      <AutomationNarrowScrollRegion><div>Long hierarchy</div></AutomationNarrowScrollRegion>
    );

    expect(html).toContain("automation-narrow-scroll-region");
    expect(html).toContain("overflow:auto");
    expect(html).toContain("overscroll-behavior:contain");
  });

  it("restores section styles when pointer cancellation interrupts a resize", () => {
    const eventTarget = new EventTarget();
    vi.stubGlobal("window", eventTarget);
    const transient = vi.fn();
    const restore = vi.fn();
    const commit = vi.fn();

    beginAutomationSectionResize({
      axis: "x",
      event: {
        clientX: 100,
        clientY: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as never,
      min: 220,
      max: 420,
      startValue: 280,
      transient,
      restore,
      commit
    });
    eventTarget.dispatchEvent(pointerEvent("pointermove", 140, 0));
    eventTarget.dispatchEvent(new Event("pointercancel"));

    expect(transient).toHaveBeenCalledWith(320);
    expect(restore).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });

  it("restores split grid styles and skips persistence on pointer cancellation", () => {
    const eventTarget = new EventTarget();
    vi.stubGlobal("window", eventTarget);
    const style = {
      gridTemplateColumns: "old-columns",
      gridTemplateRows: "old-rows"
    };
    const layout = {
      style,
      getBoundingClientRect: () => ({ height: 400, width: 800 })
    };
    const store = createAutomationWorkspaceRenderStore({
      ...defaultAutomationWorkspacePrefs(),
      mainLayoutPreset: "two-main-side",
      mainSplitRatios: [0.67, 0.33],
      panes: [
        { id: "pane-1", activeViewId: "flow-nodes", tabs: ["flow-nodes"] },
        { id: "pane-2", activeViewId: "runtime-debug", tabs: ["runtime-debug"] }
      ]
    });
    const before = [...store.getPrefs().mainSplitRatios];

    startAutomationSplitResize({
      clientX: 400,
      clientY: 0,
      currentTarget: { closest: () => layout },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as never, createAutomationWorkspaceCommandPort(store), 0, false);
    eventTarget.dispatchEvent(pointerEvent("pointermove", 500, 0));
    expect(style.gridTemplateColumns).not.toBe("old-columns");

    eventTarget.dispatchEvent(new Event("pointercancel"));
    expect(style).toEqual({
      gridTemplateColumns: "old-columns",
      gridTemplateRows: "old-rows"
    });
    expect(store.getPrefs().mainSplitRatios).toEqual(before);
  });

  it("renders a bounded empty pane when a persisted layout has thousands of unavailable tabs", () => {
    const unknownTabs = Array.from({ length: 5_000 }, (_, index) => "missing-" + index);
    const initial = {
      ...defaultAutomationWorkspacePrefs(),
      activeViewId: unknownTabs[0]!,
      panes: [{ id: "pane-main-1", activeViewId: unknownTabs[0]!, tabs: unknownTabs }]
    };
    const store = createAutomationWorkspaceRenderStore(initial);
    const port = createAutomationWorkspaceCommandPort(store);
    const warm = createAutomationWarmViewRegistry({ projectKey: "empty" });
    const commands = createAutomationWorkspaceCommands({ port, warm });
    const html = renderToStaticMarkup(
      <AutomationPaneArea
        chrome={{
          openLayoutPicker: () => undefined,
          openViewAdder: () => undefined,
          setNarrowPanel: () => undefined
        }}
        commands={commands}
        narrow={false}
        port={port}
        projectKey="empty"
        source={createAutomationWorkspaceViewSource()}
        store={store}
        warm={warm}
      />
    );

    expect(html).toContain("No view is open in this pane.");
    expect(html.length).toBeLessThan(2_000);
    expect(html).not.toContain("missing-4999");
  });

  it("keeps every new production module below 300 lines and free of root renderer contracts", () => {
    const roots = [
      new URL("../commands", import.meta.url),
      new URL(".", import.meta.url)
    ];
    const files = roots.flatMap((root) => productionFiles(root));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source.split(/\r?\n/).length, file).toBeLessThanOrEqual(300);
      expect(source, file).not.toContain("rendererRef");
      expect(source, file).not.toContain("renderInputs");
    }
  });
});

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY }
  });
  return event;
}

function productionFiles(root: URL): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = new URL(entry.name, root.href.endsWith("/") ? root : new URL(root.href + "/"));
    if (entry.isDirectory()) return productionFiles(file);
    const path = file.pathname.startsWith("/") && /^[A-Za-z]:/.test(file.pathname.slice(1))
      ? file.pathname.slice(1)
      : file.pathname;
    if (!statSync(path).isFile() || /\.test\.[tj]sx?$/.test(entry.name)) return [];
    return /\.[tj]sx?$/.test(entry.name) ? [path] : [];
  });
}
