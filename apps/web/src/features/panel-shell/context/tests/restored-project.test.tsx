// The chosen project survives a reload: restored from `?project=` (which wins) or from what this browser
// remembered, remembered again when it changes, and dropped without an error when the panel does not know it.

import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shared = vi.hoisted(() => ({
  reading: { projects: [{ id: "project.one", name: "One" }, { id: "project.two", name: "Two" }], failed: false, loaded: true } as { projects: Array<{ id: string; name: string }>; failed: boolean; loaded: boolean }
}));
vi.mock("../../top-bar/use-project-choices", () => ({ useProjectChoices: () => shared.reading }));

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

async function mount(): Promise<{ read(): PanelContextValue; unmount(): Promise<void> }> {
  let value!: PanelContextValue;
  function Probe() {
    value = usePanelContext();
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(<PanelContextProvider><Probe /></PanelContextProvider>); });
  return { read: () => value, unmount: () => act(async () => renderer.unmount()) };
}

beforeEach(() => {
  store.clear();
  refuse = false;
  shared.reading = { projects: [{ id: "project.one", name: "One" }, { id: "project.two", name: "Two" }], failed: false, loaded: true };
});

describe("the chosen project across a reload", () => {
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
    const warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    browser("?project=project.two");
    const panel = await mount();
    expect(panel.read().context.projectId).toBe("project.two");
    await act(async () => panel.read().dispatch({ type: "project", projectId: undefined }));
    expect(panel.read().context.projectId).toBeUndefined();
    expect(warned).toHaveBeenCalled();
    warned.mockRestore();
  });
});
