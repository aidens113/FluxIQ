// The app routes on the `service` profile (t803-H2): two hosted users under
// `FluxIQUserAccess`. Bob never reaches a route on Alice's project, by cookie
// or by his paired browser, while Alice does; no one reaches a framework
// (operator) route, not even an administrator's policy, because
// `FluxIQServiceGuardrail` denies `ops:*`; and a list across the workspace,
// which would show other users' items, is refused to a user.

import { GlobalProgramApiRegistry } from "fluxiq";
import { IAM_ADMINISTRATOR_ACCESS, IAM_USER_ACCESS } from "fluxiq/platform";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./app-route-fixture")).nextHeadersMock());
vi.mock("../../../lib/fluxiq", async () => (await import("./app-route-fixture")).fluxiqModuleMock());

import { APP_ROUTE_IAM_CONTRACTS } from "../../../lib/app-route-iam";
import { APP_ROUTE_CALLS } from "./app-route-calls";
import { fixture, outcome, PEOPLE, type RouteCaller } from "./app-route-fixture";

const ALICE_PROJECT = { projectId: "a-project" };
const BOB_PROJECT = { projectId: "b-project" };

function serviceRegistry(): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry({
    iam: {
      profile: "service",
      source: {
        // The hosted users hold the own-data rule; the admin, administrator access.
        resolvePolicySet: async (principal) => ({ identity: principal.id === PEOPLE.admin.id ? [IAM_ADMINISTRATOR_ACCESS] : [IAM_USER_ACCESS], guardrails: [], sessions: [], boundary: null }),
        getRole: async () => null
      }
    }
  });
  registry.registerResourceOwners("project", { ownerOf: async (id) => (id.startsWith("a-") ? "alice" : id.startsWith("b-") ? "bob" : null) });
  return registry;
}

const PROJECT_ROUTES = [
  "POST /api/client-gateway/automation-studio-context",
  "GET /api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]",
  "GET /api/programs/automation-studio/state-assets/[projectId]/[sha256]",
  "PUT /api/programs/automation-studio/state-assets/[projectId]/[sha256]"
];

const FRAMEWORK_ROUTES = APP_ROUTE_IAM_CONTRACTS.filter((contract) => contract.path.startsWith("/api/framework/")).map(
  (contract) => `${contract.method} ${contract.path}${contract.variant === undefined ? "" : ` (${contract.variant})`}`
);

async function call(name: string, caller: RouteCaller, target = ALICE_PROJECT) {
  const route = APP_ROUTE_CALLS[name];
  if (!route) throw new Error(`${name} has no call`);
  return outcome(await route(caller, target));
}

beforeEach(() => {
  fixture.registry = serviceRegistry();
});

describe("app routes on the service profile", () => {
  for (const name of PROJECT_ROUTES) {
    it(`${name}: refuses Bob on Alice's project, and lets Alice and Bob each reach their own`, async () => {
      const action = APP_ROUTE_IAM_CONTRACTS.find((contract) => `${contract.method} ${contract.path}` === name)?.action;
      await expect(call(name, { kind: "cookie", person: "bob" }, ALICE_PROJECT)).resolves.toEqual({ outcome: "forbidden", error: `Not authorized: ${action}` });
      await expect(call(name, { kind: "cookie", person: "alice" }, ALICE_PROJECT)).resolves.toEqual({ outcome: "allowed" });
      await expect(call(name, { kind: "cookie", person: "bob" }, BOB_PROJECT)).resolves.toEqual({ outcome: "allowed" });
    });
  }

  it("refuses Bob's paired browser an upload into Alice's project, and allows it into his own", async () => {
    const name = "PUT /api/programs/automation-studio/state-assets/[projectId]/[sha256]";
    await expect(call(name, { kind: "token", person: "bob" }, ALICE_PROJECT)).resolves.toEqual({ outcome: "forbidden", error: "Not authorized: studio:WriteStateAsset" });
    await expect(call(name, { kind: "token", person: "bob" }, BOB_PROJECT)).resolves.toEqual({ outcome: "allowed" });
  });

  it("covers every framework operation", () => {
    expect(FRAMEWORK_ROUTES).toHaveLength(6);
  });

  for (const name of FRAMEWORK_ROUTES) {
    it(`${name}: refuses a hosted user and an administrator alike (operator surface)`, async () => {
      for (const person of ["bob", "alice", "admin"] as const) {
        const seen = await call(name, { kind: "cookie", person });
        expect([person, seen.outcome, seen.error?.startsWith("Not authorized: ops:")]).toEqual([person, "forbidden", true]);
      }
    });
  }

  it("refuses a user a list across the workspace, which would show other users' items", async () => {
    for (const name of ["GET /api/recordings", "GET /api/client-gateway/snapshot"]) {
      await expect(call(name, { kind: "cookie", person: "bob" })).resolves.toMatchObject({ outcome: "forbidden" });
      await expect(call(name, { kind: "token", person: "bob" })).resolves.toMatchObject({ outcome: "forbidden" });
    }
  });
});
