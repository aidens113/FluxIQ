// The person's current project is one value in Core (t1095, I5). On load the panel adopts it: `?project=`
// wins, then Core's, then what this browser remembered (only the fallback when Core holds none or cannot be
// read). Every switch is written to Core, and so is a Flow a page opens. An unknown project is dropped
// without an error.

import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  reading: { projects: [{ id: "project.one", name: "One" }, { id: "project.two", name: "Two" }], failed: false, loaded: true } as { projects: Array<{ id: string; name: string }>; failed: boolean; loaded: boolean }
}));
vi.mock("../../top-bar/use-project-choices", () => ({ useProjectChoices: () => shared.reading }));

import type { PanelChangeListener, PanelChangesPort } from "../../../panel-changes";
import type { CoreContextPort, CoreContextValue } from "../core-context";
import { PanelContextProvider } from "../PanelContextProvider";
import { PROJECT_STORAGE_KEY } from "../project-storage";
import { usePanelContext } from "../use-panel-context";
import type { PanelContextValue } from "../handle";

const store = new Map<string, string>();
let refuse = false;

function browser(search: string): void {
  const localStorage = {
    getItem: (key: string) => {
      if (refuse) throw new Error("blocked");
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (refuse) throw new Error("blocked");
      store.set(key, value);
    },
    removeItem: (key: string) => {
      if (refuse) throw new Error("blocked");
      store.delete(key);
    }
  };
  (globalThis as { window?: unknown }).window = { location: { search }, localStorage };
}

/** The page's change stream, which a test drives: `tell` sends every reader one change. */
function fakeChanges() {
  const listeners = new Set<PanelChangeListener>();
  const port: PanelChangesPort = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => "live",
    reopen: () => undefined
  };
  return { port, tell: (call: (listener: PanelChangeListener) => void) => act(async () => { for (const listener of [...listeners]) call(listener); }) };
}

/** Core's value: undefined is a Core that could not be read. `pending` holds the read until released. */
function fakeCore(value: CoreContextValue | undefined, options: { pending?: boolean } = {}) {
  const writes: CoreContextValue[] = [];
  let release: () => void = () => undefined;
  const gate = options.pending ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  const port: CoreContextPort = {
    read: async () => {
      await gate;
      return current === undefined ? { ok: false, reason: "FluxIQ's current project could not be read." } : { ok: true, value: current };
    },
    write: async (next) => {
      writes.push(next);
      return { ok: true };
    }
  };
  let current = value;
  return { port, writes, release: () => act(async () => release()), set: (next: CoreContextValue) => { current = next; } };
}

async function mount(core: CoreContextPort = fakeCore(undefined).port, changes: PanelChangesPort = fakeChanges().port): Promise<{ read(): PanelContextValue; unmount(): Promise<void> }> {
  let value!: PanelContextValue;
  function Probe() {
    value = usePanelContext();
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PanelContextProvider core={core} changes={changes}><Probe /></PanelContextProvider>); });
  return { read: () => value, unmount: () => act(async () => renderer.unmount()) };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  store.clear();
  refuse = false;
  shared.reading = { projects: [{ id: "project.one", name: "One" }, { id: "project.two", name: "Two" }], failed: false, loaded: true };
});

afterEach(() => vi.restoreAllMocks());

describe("the chosen project across a reload, when Core cannot be read", () => {
  it("starts with no project when nothing names one, and does not wipe what was remembered", async () => {
    browser("");
    store.set(PROJECT_STORAGE_KEY, "project.one");
    const panel = await mount();
    expect(panel.read().context.projectId).toBe("project.one");
    await panel.unmount();
    browser("");
    store.clear();
    const empty = await mount();
    expect(empty.read().context.projectId).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("restores the remembered project after a reload", async () => {
    browser("");
    const first = await mount();
    await act(async () => first.read().dispatch({ type: "project", projectId: "project.two" }));
    expect(store.get(PROJECT_STORAGE_KEY)).toBe("project.two");
    await first.unmount();
    browser("");
    const reloaded = await mount();
    expect(reloaded.read().context.projectId).toBe("project.two");
  });

  it("opens the project the address names, ahead of the remembered one", async () => {
    browser("?project=project.one&chat=open");
    store.set(PROJECT_STORAGE_KEY, "project.two");
    const panel = await mount();
    expect(panel.read().context.projectId).toBe("project.one");
    expect(store.get(PROJECT_STORAGE_KEY)).toBe("project.one");
  });

  it("falls back to none, without an error, when the project is unknown, and forgets it", async () => {
    browser("?project=gone");
    const panel = await mount();
    expect(panel.read().context.projectId).toBeUndefined();
    expect(store.has(PROJECT_STORAGE_KEY)).toBe(false);
  });

  it("keeps the project when the list could not be read, since that proves nothing", async () => {
    shared.reading = { projects: [], failed: true, loaded: true };
    browser("?project=project.one");
    const panel = await mount();
    expect(panel.read().context.projectId).toBe("project.one");
  });

  it("does not clear a project the person picks that the list has not caught up with yet", async () => {
    browser("");
    shared.reading = { projects: [], failed: false, loaded: true };
    const panel = await mount();
    await act(async () => panel.read().dispatch({ type: "project", projectId: "project.new" }));
    expect(panel.read().context.projectId).toBe("project.new");
  });

  it("works when the browser refuses storage", async () => {
    refuse = true;
    const warned = vi.mocked(console.warn);
    warned.mockClear();
    browser("?project=project.two");
    const panel = await mount();
    expect(panel.read().context.projectId).toBe("project.two");
    await act(async () => panel.read().dispatch({ type: "project", projectId: undefined }));
    expect(panel.read().context.projectId).toBeUndefined();
    expect(warned.mock.calls.some(([reason]) => String(reason).includes("does not let FluxIQ keep"))).toBe(true);
  });

  it("falls back to the remembered project and still tells Core about it", async () => {
    browser("");
    store.set(PROJECT_STORAGE_KEY, "project.two");
    const core = fakeCore(undefined);
    const panel = await mount(core.port);
    expect(panel.read().context.projectId).toBe("project.two");
    expect(core.writes).toEqual([{ projectId: "project.two", flowId: undefined }]);
  });
});

describe("the person's one current project, shared through Core", () => {
  it("adopts Core's project on load, ahead of what this browser remembered, without writing it back", async () => {
    browser("");
    store.set(PROJECT_STORAGE_KEY, "project.one");
    const core = fakeCore({ projectId: "project.two", flowId: "flow.a" });
    const panel = await mount(core.port);
    expect(panel.read().context.projectId).toBe("project.two");
    expect(core.writes).toEqual([]);
    expect(store.get(PROJECT_STORAGE_KEY)).toBe("project.two");
  });

  it("writes the context on every switch, and the remembered project when Core held none", async () => {
    browser("");
    store.set(PROJECT_STORAGE_KEY, "project.one");
    const core = fakeCore({ projectId: undefined, flowId: undefined });
    const panel = await mount(core.port);
    expect(core.writes).toEqual([{ projectId: "project.one", flowId: undefined }]);
    await act(async () => panel.read().dispatch({ type: "project", projectId: "project.two" }));
    await act(async () => panel.read().dispatch({ type: "project", projectId: undefined }));
    expect(core.writes).toEqual([
      { projectId: "project.one", flowId: undefined },
      { projectId: "project.two", flowId: undefined },
      { projectId: undefined, flowId: undefined }
    ]);
  });

  it("writes the Flow a page opens, and nothing when the page that had it closes", async () => {
    browser("");
    const core = fakeCore({ projectId: "project.one", flowId: undefined });
    const panel = await mount(core.port);
    await act(async () => panel.read().dispatch({ type: "publish", page: "flows", selection: { flowId: "flow.a" } }));
    await act(async () => panel.read().dispatch({ type: "publish", page: "runs" }));
    await act(async () => panel.read().dispatch({ type: "publish", page: "flows", selection: { flowId: "flow.a" } }));
    expect(core.writes).toEqual([{ projectId: "project.one", flowId: "flow.a" }]);
  });

  it("opens the project the address names and makes it the current one in Core", async () => {
    browser("?project=project.one");
    const core = fakeCore({ projectId: "project.two", flowId: undefined });
    const panel = await mount(core.port);
    expect(panel.read().context.projectId).toBe("project.one");
    expect(core.writes).toEqual([{ projectId: "project.one", flowId: undefined }]);
  });

  it("never overrides a project chosen before Core answered", async () => {
    browser("");
    const core = fakeCore({ projectId: "project.two", flowId: undefined }, { pending: true });
    const panel = await mount(core.port);
    await act(async () => panel.read().dispatch({ type: "project", projectId: "project.one" }));
    await core.release();
    expect(panel.read().context.projectId).toBe("project.one");
    expect(core.writes).toEqual([{ projectId: "project.one", flowId: undefined }]);
  });

  it("follows a client's switch the moment the change stream says so, without writing it back", async () => {
    browser("");
    const core = fakeCore({ projectId: "project.one", flowId: undefined });
    const changes = fakeChanges();
    const panel = await mount(core.port, changes.port);
    expect(panel.read().context.projectId).toBe("project.one");
    core.set({ projectId: "project.two", flowId: "flow.b" });
    await changes.tell((listener) => listener.context?.());
    expect(panel.read().context.projectId).toBe("project.two");
    expect(core.writes).toEqual([]);
    // A stream that opens again reads too, since a switch may have come while it was down.
    core.set({ projectId: "project.one", flowId: undefined });
    await changes.tell((listener) => listener.opened?.());
    expect(panel.read().context.projectId).toBe("project.one");
    expect(core.writes).toEqual([]);
  });

  it("drops Core's project when the panel cannot see it, without clearing it in Core", async () => {
    browser("");
    const core = fakeCore({ projectId: "project.elsewhere", flowId: undefined });
    const panel = await mount(core.port);
    expect(panel.read().context.projectId).toBeUndefined();
    expect(core.writes).toEqual([]);
  });
});
