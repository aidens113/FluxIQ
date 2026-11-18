import { describe, expect, it } from "vitest";
import { createWorkspacePresentations } from "../index";
import { hostFacts, instanceFixture } from "./fixture";

describe("selected runtime presentation", () => {
  it("reads current capabilities from the selected instance and domain", () => {
    const registry = createWorkspacePresentations();
    const first = instanceFixture("one");
    const second = instanceFixture("two");
    second.state.definitions = 19;
    second.state.tools = 7;
    const one = registry.bind({ workspaceId: "tenant.one", instance: first.instance, runtimeId: "runtime.one", profile: "service" });
    const two = registry.bind({ workspaceId: "tenant.two", instance: second.instance, runtimeId: "runtime.two", profile: "service" });
    const view = two.forCaller({ userId: "person.one" });
    expect(view.present(hostFacts)).toMatchObject({ workspaceId: "tenant.two", runtimeId: "runtime.two", automationStudio: { nativeNodeDefinitionCount: 19, providerResolverConfigured: true, llmEvidenceRuntime: { bound: true, toolCount: 7 } } });
    expect(second.instance.programs.automationStudio.nativeRuntimeSummary).toHaveBeenCalledWith("domain.two");
    expect(first.instance.programs.automationStudio.nativeRuntimeSummary).not.toHaveBeenCalled();
    second.state.bound = false;
    second.state.evidence = false;
    second.state.provider = false;
    expect(view.present(hostFacts).automationStudio).toMatchObject({ nativeImporterRuntimeBound: false, nativeNodeRegistryConfigured: false, providerResolverConfigured: false, llmEvidenceRuntime: { bound: false } });
    expect(one.forCaller({ userId: "person.one" }).present(hostFacts).automationStudio.nativeNodeDefinitionCount).toBe(4);
  });

  it("omits host paths and arbitrary causes/provider identifiers in service payloads", () => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture();
    fixture.state.protection = "private-provider-id";
    fixture.instance.programs.automationStudio.nativeRuntimeSummary.mockReturnValue({ bound: true, definitionCount: 4, recordingMapperCount: 2, ...{ cause: "private-native-cause" } });
    const owner = registry.bind({ workspaceId: "tenant.one", instance: fixture.instance, runtimeId: "runtime.one", profile: "service" });
    const status = owner.forCaller({ userId: "person.one" }).present({ ...hostFacts, clientGatewayError: "/private/gateway: credential secret-value" });
    expect(status).not.toHaveProperty("hostRoot");
    expect(status).not.toHaveProperty("fluxiqDir");
    expect(status).not.toHaveProperty("hostModulePath");
    expect(status.clientGatewayError).toBe("Client gateway is unavailable.");
    expect(status.automationStudio.reusableLlmContext.contentProtection).toBe("available");
    const serialized = JSON.stringify(status);
    for (const secret of ["/private", "secret-value", "private-native-cause", "private-provider-id"]) expect(serialized).not.toContain(secret);
    expect(() => owner.operatorStatus(hostFacts)).toThrowError(expect.objectContaining({ code: "caller_required" }));
  });

  it.each(["local", "self-hosted"] as const)("preserves explicit %s operator diagnostics from that instance", profile => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture("selected");
    const owner = registry.bind({ workspaceId: "workspace.local", instance: fixture.instance, runtimeId: "runtime.local", profile });
    owner.forCaller({ userId: "person.one" }).beginContextWrite().commit({ activeProjectId: "project.one" });
    const status = owner.operatorStatus({ ...hostFacts, clientGatewayError: "Operator diagnostic" });
    expect(status).toMatchObject({ hostRoot: "/private/selected/root", fluxiqDir: "/private/selected/root/.fluxiq", hostModulePath: hostFacts.hostModulePath, clientGatewayError: "Operator diagnostic", automationStudio: { contextCount: 0, activeProjectId: null, reusableLlmContext: { contentProtection: "host.protection" } } });
    expect(owner.forCaller({ userId: "person.one" }).present(hostFacts).automationStudio.activeProjectId).toBe("project.one");
  });

  it.each(["local", "self-hosted"] as const)("uses the safe projector for a trusted paired caller on %s", profile => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture();
    const owner = registry.bind({ workspaceId: "workspace.local", instance: fixture.instance, runtimeId: "runtime.local", profile });
    const caller: { userId: string; channel: "panel" | "paired-client" } = { userId: "person.one", channel: "paired-client" };
    const selected = owner.forCaller(caller);
    caller.channel = "panel";
    const status = selected.present({ ...hostFacts, clientGatewayError: "/private/gateway secret-value" });
    expect(status).not.toHaveProperty("hostRoot");
    expect(status).not.toHaveProperty("fluxiqDir");
    expect(status).not.toHaveProperty("hostModulePath");
    expect(status.clientGatewayError).toBe("Client gateway is unavailable.");
    expect(status.automationStudio.reusableLlmContext.contentProtection).toBe("available");
    expect(JSON.stringify(status)).not.toContain("/private");
    expect(owner.forCaller({ userId: "person.one", channel: "panel" }).present(hostFacts).hostRoot).toBe(fixture.instance.paths.root);
  });

  it("returns detached nested readiness values and the exact known protection blocker", () => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture();
    fixture.instance.programs.automationStudio.reusableLlmContextStatus.mockReturnValue({ enabled: true, writeEnabled: false, contentProtection: "unavailable", ...{ blockerCode: "reusable_context.content_protection_unavailable" as const } });
    const owner = registry.bind({ workspaceId: "tenant.one", instance: fixture.instance, runtimeId: "runtime.one", profile: "service" });
    const caller = owner.forCaller({ userId: "person.one" });
    const first = caller.present(hostFacts);
    expect(first.automationStudio.reusableLlmContext).toEqual({ enabled: true, writeEnabled: false, contentProtection: "unavailable", blockerCode: "reusable_context.content_protection_unavailable" });
    first.automationStudio.llmEvidenceRuntime.toolCount = 1000;
    first.automationStudio.reusableLlmContext.contentProtection = "mutated";
    expect(caller.present(hostFacts).automationStudio.llmEvidenceRuntime.toolCount).toBe(3);
    expect(caller.present(hostFacts).automationStudio.reusableLlmContext.contentProtection).toBe("unavailable");
  });

  it("refuses unavailable or malformed selected runtime facts with a fixed safe error", () => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture();
    const owner = registry.bind({ workspaceId: "tenant.one", instance: fixture.instance, runtimeId: "runtime.one", profile: "service" });
    const view = owner.forCaller({ userId: "person.one" });
    fixture.instance.programs.automationStudio.nativeRuntimeSummary.mockImplementation(() => { throw new Error("/private/provider secret-value"); });
    expect(() => view.present(hostFacts)).toThrowError(expect.objectContaining({ code: "runtime_unavailable", message: "The selected workspace presentation is unavailable." }));
    fixture.instance.programs.automationStudio.nativeRuntimeSummary.mockReturnValue({ bound: true, definitionCount: -1, recordingMapperCount: 2 });
    expect(() => view.present(hostFacts)).toThrowError(expect.objectContaining({ code: "runtime_unavailable" }));
  });

  it("refuses a detached result if the runtime is retired while reading readiness", () => {
    const registry = createWorkspacePresentations();
    const fixture = instanceFixture();
    let current = true;
    const owner = registry.bind({ workspaceId: "tenant.one", instance: fixture.instance, runtimeId: "runtime.one", profile: "service", isCurrent: () => current });
    const view = owner.forCaller({ userId: "person.one" });
    fixture.instance.programs.automationStudio.nativeRuntimeSummary.mockImplementation(() => {
      current = false;
      return { bound: true, definitionCount: 4, recordingMapperCount: 2 };
    });
    expect(() => view.present(hostFacts)).toThrowError(expect.objectContaining({ code: "stale_runtime" }));
    expect(owner.isCurrent()).toBe(false);
  });
});
