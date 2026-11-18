import { describe, expect, it } from "vitest";
import { AutomationStudioHostLeaseAuthority } from "../../../../../runtime/project-agents/host-resources/index.ts";
import type { AutomationStudioServiceTrialCollaborators } from "../collaborators.ts";
import { AutomationStudioServiceTrialCollaboratorRegistry as Registry } from "../collaborator-registry.ts";

describe("the service-owned host lease authority", () => {
  it("cannot adopt a supplied foreign owner and retains exact per-owner collaborator lookup", () => {
    const owner = {}, other = {};
    const foreign = AutomationStudioHostLeaseAuthority.for(other);
    const io = { domainId: "a" };
    const supplied = { hostLeaseAuthority: foreign, hostLeaseBinding: () => foreign.forDomain("forged"), executor: () => ({ io }) } as unknown as AutomationStudioServiceTrialCollaborators;
    const ports = Registry.adopt(owner, supplied);
    expect(Registry.of(owner)).toBe(ports);
    expect(Registry.of(other)).toBeUndefined();
    expect(ports.hostLeaseAuthority).toBe(AutomationStudioHostLeaseAuthority.for(owner));
    expect(ports.hostLeaseAuthority).not.toBe(foreign);
    expect(ports.hostLeaseBinding()).toBe(ports.hostLeaseAuthority.forDomain("a"));
    io.domainId = "b";
    expect(ports.hostLeaseBinding()).toBe(ports.hostLeaseAuthority.forDomain("b"));
    expect(supplied.hostLeaseAuthority).toBe(foreign);
  });
});
