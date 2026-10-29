import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("operational framework route authorization", () => {
  it("binds every route module to the fail-closed disposition registry and decides it through IAM", () => {
    for (const file of ["setup/route.ts", "io/route.ts", "io/validate/route.ts"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source).toContain("operationalRouteContract");
      expect(source).toContain("authorizeAppRoute(fluxiq.programs.api, contract.iam");
      expect(source).not.toContain("permissions.includes");
      expect(source).toContain("status: 401");
      expect(source).toContain("status: refusal.status");
    }
  });

  it("rejects unsupported setup actions instead of treating them as setup", () => {
    const source = readFileSync(new URL("../setup/route.ts", import.meta.url), "utf8");
    expect(source).toContain("Unsupported framework setup action");
    expect(source).toContain("status: 400");
  });
});
