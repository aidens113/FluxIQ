import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioProjectSyncClientOptions, AutomationStudioScopedInvalidation } from "./project-sync";
import { ProjectSynchronizationController, type AutomationStudioMutationEventTarget } from "./useProjectSynchronization";

function mutationTarget() {
  const listeners = new Set<EventListener>();
  const target: AutomationStudioMutationEventTarget = {
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener)
  };
  return {
    target,
    emit(detail: { programId?: string; projectId?: string }) {
      for (const listener of listeners) listener(new CustomEvent("program-api:mutation", { detail }));
    },
    listenerCount: () => listeners.size
  };
}

describe("ProjectSynchronizationController", () => {
  it("owns exactly one project client and stops it before switching", () => {
    const created: Array<{ options: AutomationStudioProjectSyncClientOptions; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; notifyMutation: ReturnType<typeof vi.fn> }> = [];
    const controller = new ProjectSynchronizationController((options) => {
      const client = { options, start: vi.fn(), stop: vi.fn(), notifyMutation: vi.fn() };
      created.push(client);
      return client;
    });
    const events = mutationTarget();
    const base = { fetchPage: vi.fn(), onInvalidations: vi.fn(), mutationTarget: events.target };

    controller.open({ projectId: "project.a", ...base });
    controller.open({ projectId: "project.b", ...base });

    expect(created).toHaveLength(2);
    expect(created[0]?.start).toHaveBeenCalledOnce();
    expect(created[0]?.stop).toHaveBeenCalledOnce();
    expect(created[1]?.start).toHaveBeenCalledOnce();
    expect(controller.projectId).toBe("project.b");
    expect(events.listenerCount()).toBe(1);
  });

  it("ignores invalidations emitted by a stopped project generation", () => {
    const clients: AutomationStudioProjectSyncClientOptions[] = [];
    const controller = new ProjectSynchronizationController((options) => {
      clients.push(options);
      return { start: vi.fn(), stop: vi.fn(), notifyMutation: vi.fn() };
    });
    const onA = vi.fn();
    const onB = vi.fn();
    const invalidations = [] as AutomationStudioScopedInvalidation[];

    controller.open({ projectId: "project.a", fetchPage: vi.fn(), onInvalidations: onA });
    const staleCallback = clients[0]?.onInvalidations;
    controller.open({ projectId: "project.b", fetchPage: vi.fn(), onInvalidations: onB });
    staleCallback?.(invalidations);
    clients[1]?.onInvalidations?.(invalidations);

    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledOnce();
  });

  it("forwards only matching Automation Studio mutation notifications", () => {
    const notifyMutation = vi.fn();
    const events = mutationTarget();
    const controller = new ProjectSynchronizationController(() => ({ start: vi.fn(), stop: vi.fn(), notifyMutation }));
    controller.open({ projectId: "project.a", fetchPage: vi.fn(), onInvalidations: vi.fn(), mutationTarget: events.target });

    events.emit({ programId: "another-program", projectId: "project.a" });
    events.emit({ programId: "automation-studio", projectId: "project.b" });
    events.emit({ programId: "automation-studio", projectId: "project.a" });

    expect(notifyMutation).toHaveBeenCalledOnce();
    controller.dispose();
    expect(events.listenerCount()).toBe(0);
  });
});