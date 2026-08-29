import { describe, expect, it, vi } from "vitest";
import { projectDraftForRequest } from "./ProjectOverlaySubscriber";
import {
  createAutomationStudioOverlayStore,
  defaultAutomationStudioOverlayState
} from "./overlay-state-store";

describe("AutomationStudioOverlayStore", () => {
  it("publishes only the overlay channel that opened", () => {
    const store = createAutomationStudioOverlayStore();
    const projectSubscriber = vi.fn();
    const hierarchySubscriber = vi.fn();
    const preferencesSubscriber = vi.fn();
    store.subscribe("project", projectSubscriber);
    store.subscribe("hierarchy", hierarchySubscriber);
    store.subscribe("preferences", preferencesSubscriber);

    store.replace("project", { id: "project-create", kind: "create-project", categoryId: null });

    expect(projectSubscriber).toHaveBeenCalledTimes(1);
    expect(hierarchySubscriber).not.toHaveBeenCalled();
    expect(preferencesSubscriber).not.toHaveBeenCalled();
    expect(store.getRevision("project")).toBe(1);
    expect(store.getRevision("hierarchy")).toBe(0);
  });

  it("keeps form typing outside overlay, workspace, and domain stores", () => {
    const store = createAutomationStudioOverlayStore();
    const overlaySubscriber = vi.fn();
    const workspaceSubscriber = vi.fn();
    const domainSubscriber = vi.fn();
    store.subscribe("project", overlaySubscriber);
    const request = { id: "edit", kind: "edit-project", project: { id: "p1", name: "Before" } } as const;
    const draft = projectDraftForRequest(request);

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