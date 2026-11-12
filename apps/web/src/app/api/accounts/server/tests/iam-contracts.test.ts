import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCOUNT_ROUTE_IAM_CONTRACTS, accountRouteContract } from "..";

const ACCOUNTS_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function exportedRoutes(): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(ACCOUNTS_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "server") continue;
    let source: string;
    try {
      source = readFileSync(path.join(ACCOUNTS_ROOT, entry.name, "route.ts"), "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/gu)) routes.push(`${match[1]} /api/accounts/${entry.name}`);
  }
  return routes.sort();
}

describe("the accounts routes' IAM contracts", () => {
  it("classify every accounts route and method, and nothing else", () => {
    expect([...new Set(ACCOUNT_ROUTE_IAM_CONTRACTS.map((contract) => `${contract.method} ${contract.path}`))].sort()).toEqual(exportedRoutes());
  });

  it("require identity.manage of a panel caller only, under iam actions", () => {
    for (const contract of ACCOUNT_ROUTE_IAM_CONTRACTS) {
      expect(contract.callers).toEqual({ panel: "identity.manage" });
      expect(contract.action).toMatch(/^iam:[A-Z][A-Za-z]*$/u);
    }
  });

  it("act on the workspace for the list and an invite, and on the named person for a change", () => {
    expect(accountRouteContract("GET", "/api/accounts/members").resource.of({})).toEqual({ kind: "workspace" });
    expect(accountRouteContract("POST", "/api/accounts/invite").resource.of({})).toEqual({ kind: "workspace" });
    for (const variant of ["set-role", "turn-off", "turn-on", "remove", "resend-invite", "revoke-invite"]) {
      expect(accountRouteContract("POST", "/api/accounts/member", variant).resource.of({ userId: "u1" })).toEqual({ kind: "user", userId: "u1" });
    }
    expect(() => accountRouteContract("POST", "/api/accounts/member", "make-owner")).toThrow(/Unclassified/u);
  });
});
