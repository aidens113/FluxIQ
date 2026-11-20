import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
}

describe("operational framework route authorization", () => {
  it("binds every route module to the fail-closed disposition registry and decides it through IAM", () => {
    for (const file of ["setup/route.ts", "io/route.ts", "io/validate/route.ts"]) {
      const route = source(file);
      expect(route, file).toContain("operationalRouteContract");
      expect(route, file).not.toContain("permissions.includes");
    }
    // Setup holds the caller's workspace (the one workspace of a single-tenancy server) and decides through its route context.
    const setup = source("setup/route.ts");
    expect(setup).toContain("workspaceRouteContext(request, contract.iam)");
    expect(setup).toContain("status: refusal.status");
    // The IO routes hold the selected tenant's authority (t914, 6ba2e1f29): the
    // route context authenticates, decides the contract through IAM and answers
    // its refusal's own status. `io/tests/route.test.ts` drives both routes.
    expect(source("io/route.ts")).toContain("withWorkspaceRouteJson(request, ROUTE,");
    const validate = source("io/validate/route.ts");
    expect(validate).toContain("workspaceRouteContext(request, ROUTE)");
    expect(validate).toContain("status: refusal.status");
    expect(readFileSync(new URL("../../../../lib/workspaces/routes/authorize.ts", import.meta.url), "utf8")).toContain("await authorizeAppRoute(");
  });

  it("rejects unsupported setup actions instead of treating them as setup", () => {
    const setup = source("setup/route.ts");
    expect(setup).toContain("Unsupported framework setup action");
    expect(setup).toContain("status: 400");
  });
});
