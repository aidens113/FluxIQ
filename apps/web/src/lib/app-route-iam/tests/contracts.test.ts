import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_ROUTE_IAM_CONTRACTS, APP_ROUTES_DECIDED_BY_REGISTRY, appRouteIamContract } from "..";

const API_ROOT = fileURLToPath(new URL("../../../app/api", import.meta.url));
// Login and logout stay unauthenticated (lane A); discovery is not an app route of this lane.
const UNAUTHENTICATED = ["auth", "discovery"];
const PERMISSIONS = new Set(["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage", "none"]);

function routeFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "tests") routeFiles(target, found);
    else if (entry.isFile() && entry.name === "route.ts") found.push(target);
  }
  return found;
}

/** Every `METHOD /api/...` an authenticated route file exports. */
function exportedRoutes(): string[] {
  const routes: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const relative = path.relative(API_ROOT, path.dirname(file)).split(path.sep);
    if (UNAUTHENTICATED.includes(relative[0] ?? "")) continue;
    const route = `/api/${relative.join("/")}`;
    for (const match of readFileSync(file, "utf8").matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/gu)) routes.push(`${match[1]} ${route}`);
  }
  return routes.sort();
}

describe("the app route IAM table", () => {
  it("classifies every authenticated route and method, once, here or as decided by the registry", () => {
    const classified = [
      ...APP_ROUTE_IAM_CONTRACTS.map((contract) => `${contract.method} ${contract.path}`),
      ...APP_ROUTES_DECIDED_BY_REGISTRY.flatMap((route) => route.methods.map((method) => `${method} ${route.path}`))
    ];
    expect([...new Set(classified)].sort()).toEqual(exportedRoutes());
    const keys = APP_ROUTE_IAM_CONTRACTS.map((contract) => `${contract.method} ${contract.path} ${contract.variant ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names each action <service>:<PascalCase>, framework operations under ops on the framework's program", () => {
    for (const contract of APP_ROUTE_IAM_CONTRACTS) {
      expect(contract.action).toMatch(/^(studio|secrets|gateway|iam|ops|platform):[A-Z][A-Za-z0-9]*$/u);
      const framework = contract.path.startsWith("/api/framework/");
      expect([contract.path, contract.action.startsWith("ops:")]).toEqual([contract.path, framework]);
      if (framework) expect([contract.path, contract.programId, contract.resource.of({})]).toEqual([contract.path, "framework", { kind: "program" }]);
    }
  });

  it("requires of each caller one permission, or none", () => {
    for (const contract of APP_ROUTE_IAM_CONTRACTS) {
      const callers = Object.entries(contract.callers);
      expect(callers.length).toBeGreaterThan(0);
      for (const [caller, permission] of callers) {
        expect(["panel", "paired-client"]).toContain(caller);
        expect(PERMISSIONS.has(permission)).toBe(true);
      }
    }
  });

  it("throws for a route that is not classified", () => {
    expect(() => appRouteIamContract("POST", "/api/framework/setup", "erase")).toThrow(/Unclassified app route/u);
    expect(() => appRouteIamContract("GET", "/api/elsewhere")).toThrow(/Unclassified app route/u);
    expect(appRouteIamContract("POST", "/api/framework/setup", "migrate").action).toBe("ops:MigrateFrameworkStorage");
  });

  it("takes each route's resources from its request, the narrowest it names", () => {
    const of = (method: "GET" | "POST" | "PUT", route: string, input: Record<string, unknown> = {}) => appRouteIamContract(method, route).resource.of(input);
    expect(of("GET", "/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]", { projectId: "p", datasetId: "d" })).toEqual({ kind: "project-child", projectId: "p", child: "dataset", childId: "d" });
    expect(of("PUT", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]", { projectId: "p" })).toEqual({ kind: "project", projectId: "p" });
    expect(of("PUT", "/api/client-gateway/trace-artifacts/[sha256]", { trustedClientId: "t" })).toEqual({ kind: "client", clientId: "t" });
    expect(of("POST", "/api/client-gateway/approve-pairing", { pairingCode: "123456" })).toEqual({ kind: "user", self: true });
    const context = "/api/client-gateway/automation-studio-context";
    expect(of("POST", context, { activeProjectId: "p", activeFlowId: "f" })).toEqual({ kind: "project-child", projectId: "p", child: "flow", childId: "f" });
    expect(of("POST", context, { activeProjectId: "p", activeFlowId: null })).toEqual({ kind: "project", projectId: "p" });
    expect(of("POST", context, { activeProjectId: null })).toEqual({ kind: "user", self: true });
    for (const route of ["/api/recordings", "/api/client-gateway/snapshot", "/api/programs"]) expect(of("GET", route)).toEqual({ kind: "workspace" });
  });
});
