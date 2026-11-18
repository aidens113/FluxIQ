import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_ROUTE_IAM_CONTRACTS, APP_ROUTES_DECIDED_BY_REGISTRY, appRouteIamContract } from "..";

const API_ROOT = fileURLToPath(new URL("../../../app/api", import.meta.url));
// Login and logout stay unauthenticated (lane A); discovery is not an app route of this lane.
const UNAUTHENTICATED = ["auth", "discovery"];
// These exact endpoints authenticate their own proof, never a panel cookie or submitted actor.
// Self-forget only reduces credential authority; it does not require a live content/IAM session.
// The payment provider's webhook proves itself by the provider's signature over the raw body.
const PUBLIC_PROOF_ROUTES = new Set(["POST /api/keys/session", "POST /api/connect/token", "POST /api/connect/revoke", "POST /api/client-gateway/forget-pairing", "POST /api/platform/v1/commerce/webhook"]);
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
    for (const match of readFileSync(file, "utf8").matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/gu)) {
      const operation = `${match[1]} ${route}`;
      if (!PUBLIC_PROOF_ROUTES.has(operation)) routes.push(operation);
    }
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

  it("classifies consent and key management as the signed-in caller's own account", () => {
    for (const [method, path, action] of [["POST", "/api/connect/authorize", "gateway:ApprovePairing"], ["GET", "/api/keys", "iam:ListApiKeys"], ["POST", "/api/keys", "iam:EnrollApiKey"], ["DELETE", "/api/keys", "iam:RevokeApiKey"]] as const) {
      const contract = appRouteIamContract(method, path);
      expect(contract.action).toBe(action);
      expect(contract.callers).toEqual({ panel: "none" });
      expect(contract.resource.of({ userId: "forged-body-user" })).toEqual({ kind: "user", self: true });
    }
    for (const operation of PUBLIC_PROOF_ROUTES) {
      const [method, path] = operation.split(" ");
      expect(method).toBe("POST");
      expect(["/api/keys/session", "/api/connect/token", "/api/connect/revoke", "/api/client-gateway/forget-pairing", "/api/platform/v1/commerce/webhook"]).toContain(path);
    }
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
    for (const route of ["/api/recordings", "/api/client-gateway/snapshot", "/api/panel/changes", "/api/programs", "/api/accounts/members", "/api/security/audit"]) expect(of("GET", route)).toEqual({ kind: "workspace" });
    expect(of("POST", "/api/accounts/invite")).toEqual({ kind: "workspace" });
    for (const variant of ["set-role", "turn-off", "turn-on", "remove", "resend-invite", "revoke-invite"]) {
      expect(appRouteIamContract("POST", "/api/accounts/member", variant).resource.of({ userId: "u1" })).toEqual({ kind: "user", userId: "u1" });
    }
  });

  it("decides people and the activity log by identity.manage, for a panel caller only", () => {
    const managed = APP_ROUTE_IAM_CONTRACTS.filter((contract) => contract.path.startsWith("/api/accounts/") || contract.path === "/api/security/audit");
    expect(managed).toHaveLength(9);
    for (const contract of managed) expect([contract.path, contract.variant, contract.callers, contract.action.startsWith("iam:")]).toEqual([contract.path, contract.variant, { panel: "identity.manage" }, true]);
  });
});
