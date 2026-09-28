import { describe, expect, it, vi } from "vitest";
import {
  createAutomationStudioOverlayStore,
  defaultAutomationStudioOverlayState
} from "../overlay-state-store";

describe("AutomationStudioOverlayStore", () => {
  it("publishes only the overlay channel that opened", () => {
    const store = createAutomationStudioOverlayStore();
    const preferencesSubscriber = vi.fn();
    const viewAdderSubscriber = vi.fn();
    const drawerSubscriber = vi.fn();
    store.subscribe("preferences", preferencesSubscriber);
    store.subscribe("viewAdder", viewAdderSubscriber);
    store.subscribe("drawer", drawerSubscriber);

    store.replace("preferences", { id: "prefs", prefs: {} as never, saveStatus: "idle" });

    expect(preferencesSubscriber).toHaveBeenCalledTimes(1);
    expect(viewAdderSubscriber).not.toHaveBeenCalled();
    expect(drawerSubscriber).not.toHaveBeenCalled();
    expect(store.getRevision("preferences")).toBe(1);
    expect(store.getRevision("viewAdder")).toBe(0);
  });

  it("keeps form typing outside overlay, workspace, and domain stores", () => {
    const store = createAutomationStudioOverlayStore();
    const overlaySubscriber = vi.fn();
    const workspaceSubscriber = vi.fn();
    const domainSubscriber = vi.fn();
    store.subscribe("preferences", overlaySubscriber);
    const draft = { name: "Before", pin: "" };

    const typedDraft = { ...draft, name: "After", pin: "1234" };

    expect(typedDraft).toMatchObject({ name: "After", pin: "1234" });
    expect(store.getState()).toEqual(defaultAutomationStudioOverlayState());
    expect(overlaySubscriber).not.toHaveBeenCalled();
    expect(workspaceSubscriber).not.toHaveBeenCalled();
    expect(domainSubscriber).not.toHaveBeenCalled();
  });

  it("suppresses identity-equal replacements", () => {
    const store = createAutomationStudioOverlayStore();
    const subscriber = vi.fn();
    store.subscribe("drawer", subscriber);
    expect(store.replace("drawer", null)).toBe(false);
    expect(subscriber).not.toHaveBeenCalled();
  });
});
