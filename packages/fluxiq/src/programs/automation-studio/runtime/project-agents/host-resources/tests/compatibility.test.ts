import { describe, expect, it } from "vitest";
import * as legacy from "../index.ts";
import * as resources from "../../../../../../runtime/host-resources/index.ts";
import { StubHost } from "../../../../../../runtime/host-resources/tests/stub-host.ts";

describe("the Studio host-resource compatibility surface", () => {
  it("shares the canonical scheduler, scope, and error classes", () => {
    expect(legacy.AutomationStudioHostLeaseScope).toBe(resources.AutomationStudioHostLeaseScope);
    expect(legacy.AutomationStudioHostResourceScheduler).toBe(resources.AutomationStudioHostResourceScheduler);
    expect(legacy.AutomationStudioHostResourcePortContractError).toBe(resources.AutomationStudioHostResourcePortContractError);
    expect(legacy.AutomationStudioHostResourceStaleLeaseError).toBe(resources.AutomationStudioHostResourceStaleLeaseError);
  });

  it("carries the same current lease through old and canonical async scope readers", async () => {
    const scope = resources.automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }));
    await scope.run({ role: "builder", briefId: "brief.compatibility" }, async (lease) => {
      await Promise.resolve();
      expect(legacy.AutomationStudioHostLeaseScope.current()).toBe(lease);
      expect(resources.AutomationStudioHostLeaseScope.current()).toBe(lease);
      expect(resources.AutomationStudioHostLeaseScope.gatewaySource.current()).toBe(lease);
    });
    expect(resources.AutomationStudioHostLeaseScope.current()).toBeUndefined();
    expect(legacy.AutomationStudioHostLeaseScope.gatewaySource).toBe(resources.AutomationStudioHostLeaseScope.gatewaySource);
  });
});
