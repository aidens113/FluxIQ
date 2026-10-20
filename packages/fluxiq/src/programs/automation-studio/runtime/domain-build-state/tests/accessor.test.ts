// A registered domain reaches its durable build state through the FluxIQ
// instance it was registered on, and nothing else does (t728).

import { describe, expect, it } from "vitest";
import { AutomationStudioProjectPaths } from "../../service/paths/index.ts";
import { automationStudioDomainBuildState } from "../accessor.ts";
import { AutomationStudioDomainBuildStateStore } from "../store.ts";

function owner(registered: string[]) {
  const store = new AutomationStudioDomainBuildStateStore(() => new AutomationStudioProjectPaths(undefined));
  return { domains: { maybeGet: (domainId: string) => (registered.includes(domainId) ? { id: domainId } : undefined) }, programs: { automationStudio: { domainBuildState: store } } };
}

describe("a domain's build state accessor", () => {
  it("is bound to its domain, and shares the instance's store", async () => {
    const fluxiq = owner(["warehouse", "ledger"]);
    const warehouse = automationStudioDomainBuildState(fluxiq, "warehouse");
    const scope = { projectId: "p1", flowId: "f1", buildId: "build.1" };
    await warehouse.put(scope, "k", 1);
    expect(warehouse.domainId).toBe("warehouse");
    expect(await automationStudioDomainBuildState(fluxiq, "warehouse").get(scope, "k")).toBe(1);
    expect(await automationStudioDomainBuildState(fluxiq, "ledger").get(scope, "k")).toBeUndefined();
    expect(await warehouse.drop(scope, "k")).toBe(true);
    expect(Object.isFrozen(warehouse)).toBe(true);
  });

  it("refuses a domain the instance never registered", () => {
    expect(() => automationStudioDomainBuildState(owner(["warehouse"]), "ledger")).toThrow(expect.objectContaining({ code: "domain_build_state.domain_unregistered" }));
    expect(() => automationStudioDomainBuildState(owner(["warehouse"]), "")).toThrow(expect.objectContaining({ code: "domain_build_state.domain_unregistered" }));
  });
});
