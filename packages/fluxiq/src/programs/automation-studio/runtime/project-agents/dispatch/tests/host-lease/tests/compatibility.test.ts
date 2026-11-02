import { describe, expect, it } from "vitest";
import { automationStudioProjectHostLeaseScope as legacyScope } from "../../../host-lease.ts";
import { automationStudioProjectHostLeaseScope } from "../../../../../../../../runtime/host-resources/index.ts";
import { StubHost } from "../../../../../../../../runtime/host-resources/tests/stub-host.ts";

describe("the Studio dispatcher host-lease facade", () => {
  it("shares the exact function and port-keyed scheduler registry", () => {
    expect(legacyScope).toBe(automationStudioProjectHostLeaseScope);
    const host = new StubHost({ capacity: 1 });
    expect(legacyScope(host)).toBe(automationStudioProjectHostLeaseScope(host));
  });
});
