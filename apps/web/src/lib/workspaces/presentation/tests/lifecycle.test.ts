import { describe, expect, it, vi } from "vitest";
import { createWorkspacePresentations } from "../index";
import { hostFacts, instanceFixture, recordingInput } from "./fixture";

describe("exact runtime presentation lifecycle", () => {
  it("does not evaluate construction currentness before a tenant is published", () => {
    const registry = createWorkspacePresentations();
    const instance = instanceFixture().instance;
    let published = false;
    const isCurrent = vi.fn(() => published);
    const owner = registry.bind({ workspaceId: "tenant.one", instance, runtimeId: "runtime.one", profile: "service", isCurrent });
    expect(isCurrent).not.toHaveBeenCalled();
    published = true;
    expect(owner.isCurrent()).toBe(true);
    expect(registry.forInstance("tenant.one", instance)).toBe(owner);
    expect(registry.forInstance("tenant.foreign", instance)).toBeUndefined();
    expect(registry.forInstance("tenant.one", instanceFixture().instance)).toBeUndefined();
  });

  it("permanently binds an instance to its workspace and exact construction identity", () => {
    const registry = createWorkspacePresentations();
    const instance = instanceFixture().instance;
    const binding = { workspaceId: "tenant.one", instance, runtimeId: "runtime.one", profile: "service" as const };
    const owner = registry.bind(binding);
    expect(registry.bind(binding)).toBe(owner);
    expect(() => registry.bind({ ...binding, workspaceId: "tenant.other" })).toThrowError(expect.objectContaining({ code: "binding_conflict" }));
    expect(() => registry.bind({ ...binding, runtimeId: "runtime.other" })).toThrowError(expect.objectContaining({ code: "binding_conflict" }));
    registry.invalidate(binding.workspaceId, instance);
    expect(() => registry.bind(binding)).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
  });

  it("replacement invalidates old handles/tickets/providers and late retirement cannot remove the new owner", async () => {
    const registry = createWorkspacePresentations();
    const previous = instanceFixture("old").instance;
    const old = registry.bind({ workspaceId: "tenant.one", instance: previous, runtimeId: "runtime.old", profile: "service" });
    const caller = old.forCaller({ userId: "user.same", clientId: "client.same" });
    caller.beginContextWrite().commit({ activeProjectId: "project.old" });
    const late = caller.beginContextWrite();
    const instance = instanceFixture("new").instance;
    const current = registry.bind({ workspaceId: "tenant.one", instance, runtimeId: "runtime.new", profile: "service" });
    expect(() => late.commit({ activeProjectId: "must-not-land" })).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    expect(() => caller.present(hostFacts)).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    expect(await old.recordingContextProvider(recordingInput())).toMatchObject({ ok: false, code: "recording.project_required" });
    expect(registry.invalidate("tenant.one", previous)).toBe(false);
    expect(registry.forInstance("tenant.one", instance)).toBe(current);
    expect(current.forCaller({ userId: "user.same" }).context()).toBeUndefined();
  });

  it("manager-current false permanently retires callbacks without needing another bind", async () => {
    const registry = createWorkspacePresentations();
    const instance = instanceFixture().instance;
    let current = true;
    const binding = { workspaceId: "tenant.one", instance, runtimeId: "runtime.one", profile: "service" as const, isCurrent: () => current };
    const owner = registry.bind(binding);
    const caller = owner.forCaller({ userId: "user.same" });
    caller.beginContextWrite().commit({ activeProjectId: "project.one" });
    const ticket = caller.beginContextWrite();
    current = false;
    expect(() => ticket.commit({ activeProjectId: "stale" })).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    current = true;
    expect(owner.isCurrent()).toBe(false);
    expect(() => caller.context()).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    expect(await owner.recordingContextProvider(recordingInput())).toMatchObject({ ok: false });
    expect(() => registry.bind(binding)).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
  });

  it("close invalidates all owners, queued writes, callbacks and future binds", async () => {
    const registry = createWorkspacePresentations();
    const binding = { workspaceId: "tenant.one", instance: instanceFixture().instance, runtimeId: "runtime.one", profile: "service" as const };
    const owner = registry.bind(binding);
    const ticket = owner.forCaller({ userId: "user.same" }).beginContextWrite();
    registry.close();
    expect(() => ticket.commit({ activeProjectId: "project.one" })).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    expect(await owner.recordingContextProvider(recordingInput())).toMatchObject({ ok: false });
    expect(registry.forInstance(binding.workspaceId, binding.instance)).toBeUndefined();
    expect(() => registry.bind(binding)).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
  });
});
