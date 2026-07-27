import { describe, expect, it } from "vitest";
import {
  buildProgramDirectory,
  defaultGlobalProgramCatalog,
  GlobalProgramApiRegistry
} from "./index";

describe("global programs", () => {
  it("catalogs audited global programs and excludes domain/account programs", () => {
    const ids = defaultGlobalProgramCatalog().map((program) => program.id);

    expect(ids).toEqual([
      "automation-studio",
      "flow-editor",
      "identity-access",
      "database-manager",
      "background-tasks",
      "compute-control",
      "deployment-sync",
      "docs",
      "production-runner"
    ]);
    expect(ids).not.toContain("accounts-manager");
    expect(ids).not.toContain("account-manager");
    expect(ids).not.toContain("ge-pricing");
    expect(ids).not.toContain("ge-signals");
    expect(ids).not.toContain("merchanting");
    expect(ids).not.toContain("profitable-crafting-recipes");
  });

  it("returns only global framework programs even when scoped to a domain", () => {
    const programs = defaultGlobalProgramCatalog({ domainId: "example" });

    expect(programs.length).toBeGreaterThan(0);
    expect(programs.every((program) => program.globalProgram)).toBe(true);
    expect(programs.every((program) => program.scope === "domain")).toBe(true);
    expect(programs.every((program) => program.route.startsWith("/domains/example/programs/"))).toBe(true);
  });

  it("exposes the host domain program root without including domain programs", () => {
    const directory = buildProgramDirectory({
      domainProgramRoot: "domains/programs",
      domains: [],
      domain: null
    });

    expect(directory.domainProgramRoot).toBe("domains/programs");
    expect(directory.programs.every((program) => program.globalProgram)).toBe(true);
  });

  it("registers and calls global program API handlers", async () => {
    const registry = new GlobalProgramApiRegistry();
    registry.register({
      programId: "automation-studio",
      endpoint: "snapshot",
      handler: (request) => ({
        ok: true,
        payload: { domainId: request.scope.domainId ?? null }
      })
    });

    const result = await registry.call<{ id: string }, { domainId: string | null }>({
      programId: "automation-studio",
      endpoint: "snapshot",
      scope: { domainId: "example" },
      payload: { id: "task" }
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.domainId).toBe("example");
  });

  it("rejects API handlers for unknown program ids", () => {
    const registry = new GlobalProgramApiRegistry();

    expect(() => {
      registry.register({
        programId: "domain-only-program",
        endpoint: "snapshot",
        handler: () => ({ ok: true })
      });
    }).toThrow("Unknown global program id");
  });
});
