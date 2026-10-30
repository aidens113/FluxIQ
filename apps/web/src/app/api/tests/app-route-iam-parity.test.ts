// Parity of the app routes' IAM decisions (t803-H2): on the `local` profile
// every route allows and refuses exactly as its permission check did, for
// today's admin and viewer by cookie and for a paired client approved by each.
// The expectations are today's checks written out by hand, not derived from
// the IAM table, so a table entry that drifts from today fails here.

import { GlobalProgramApiRegistry } from "fluxiq";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./app-route-fixture")).nextHeadersMock());
vi.mock("../../../lib/fluxiq", async () => (await import("./app-route-fixture")).fluxiqModuleMock());

import { APP_ROUTE_IAM_CONTRACTS } from "../../../lib/app-route-iam";
import { POST as callProgram } from "../programs/[programId]/[endpoint]/route";
import { APP_ROUTE_CALLS } from "./app-route-calls";
import { fixture, outcome, routeRequest, type RouteCaller } from "./app-route-fixture";

type Expected = "allowed" | "unauthenticated" | `forbidden: ${string}`;
type Row = readonly [admin: Expected, viewer: Expected, pairedByAdmin: Expected, pairedByViewer: Expected];

const CALLERS: readonly RouteCaller[] = [
  { kind: "cookie", person: "admin" },
  { kind: "cookie", person: "viewer" },
  { kind: "token", person: "admin" },
  { kind: "token", person: "viewer" }
];

const COOKIE_ONLY_READ: Row = ["allowed", "allowed", "unauthenticated", "unauthenticated"];
const needs = (permission: string): Row => ["allowed", `forbidden: Permission required: ${permission}`, "unauthenticated", "unauthenticated"];

// Today's checks, route by route: the permission each read, and whether it took a token.
const TODAY: Readonly<Record<string, Row>> = {
  "POST /api/client-gateway/approve-pairing": needs("runtime.control"),
  "POST /api/client-gateway/dismiss-pairing": needs("runtime.control"),
  "POST /api/client-gateway/automation-studio-context": needs("runtime.control"),
  "GET /api/client-gateway/snapshot": ["allowed", "allowed", "allowed", "allowed"],
  "PUT /api/client-gateway/trace-artifacts/[sha256]": ["unauthenticated", "unauthenticated", "allowed", "allowed"],
  "GET /api/framework/setup": COOKIE_ONLY_READ,
  "POST /api/framework/setup (setup)": needs("programs.write"),
  "POST /api/framework/setup (migrate)": needs("programs.write"),
  "POST /api/framework/setup (rollback-migration)": needs("programs.write"),
  "GET /api/framework/io": COOKIE_ONLY_READ,
  "POST /api/framework/io/validate": COOKIE_ONLY_READ,
  "GET /api/programs": COOKIE_ONLY_READ,
  "GET /api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]": COOKIE_ONLY_READ,
  "GET /api/programs/automation-studio/state-assets/[projectId]/[sha256]": COOKIE_ONLY_READ,
  "PUT /api/programs/automation-studio/state-assets/[projectId]/[sha256]": ["allowed", "forbidden: Permission required: programs.write", "allowed", "allowed"],
  "GET /api/recordings": ["allowed", "allowed", "allowed", "allowed"]
};

function key(contract: (typeof APP_ROUTE_IAM_CONTRACTS)[number]): string {
  return `${contract.method} ${contract.path}${contract.variant === undefined ? "" : ` (${contract.variant})`}`;
}

async function observed(response: Response): Promise<Expected> {
  const seen = await outcome(response);
  return seen.outcome === "forbidden" ? `forbidden: ${seen.error ?? ""}` : seen.outcome;
}

beforeEach(() => {
  fixture.registry = new GlobalProgramApiRegistry();
});

describe("app route IAM parity on the local profile", () => {
  it("has a call and today's expectation for every route in the IAM table, and nothing else", () => {
    const keys = APP_ROUTE_IAM_CONTRACTS.map(key).sort();
    expect(Object.keys(APP_ROUTE_CALLS).sort()).toEqual(keys);
    expect(Object.keys(TODAY).sort()).toEqual(keys);
  });

  for (const contract of APP_ROUTE_IAM_CONTRACTS) {
    const name = key(contract);
    it(`${name} allows and refuses as today`, async () => {
      const call = APP_ROUTE_CALLS[name];
      const row = TODAY[name];
      if (!call || !row) throw new Error(`${name} has no call or expectation`);
      const seen: Expected[] = [];
      for (const caller of CALLERS) seen.push(await observed(await call(caller, { projectId: "project-1" })));
      expect(seen).toEqual(row);
    });
  }

  it("decides a self-hosted registry exactly as a local one", async () => {
    fixture.registry = new GlobalProgramApiRegistry({ iam: { profile: "self-hosted" } });
    for (const contract of APP_ROUTE_IAM_CONTRACTS) {
      const name = key(contract);
      const seen: Expected[] = [];
      for (const caller of CALLERS) seen.push(await observed(await APP_ROUTE_CALLS[name]!(caller, { projectId: "project-1" })));
      expect([name, ...seen]).toEqual([name, ...TODAY[name]!]);
    }
  });
});

describe("the program route on the local profile", () => {
  // Decided by the registry's `call`, by each registration's permission; the
  // route only names the channel. Two allowlisted endpoints, stubbed.
  function register(registry: GlobalProgramApiRegistry): void {
    registry.register({ programId: "automation-studio", endpoint: "list-flow-summaries", permission: "programs.read", classification: "read", handler: () => ({ ok: true, payload: {} }) });
    registry.register({ programId: "automation-studio", endpoint: "generate-recording-proposal", permission: "flows.write", classification: "authoring", handler: () => ({ ok: true, payload: {} }) });
  }

  async function program(caller: RouteCaller, endpoint: string): Promise<Expected> {
    const response = await callProgram(routeRequest(caller, `/api/programs/automation-studio/${endpoint}`, { method: "POST", json: {} }), { params: Promise.resolve({ programId: "automation-studio", endpoint }) });
    return observed(response);
  }

  it("allows and refuses as the registration's permission did, by cookie and by token", async () => {
    const registry = new GlobalProgramApiRegistry();
    register(registry);
    fixture.registry = registry;
    const read: Expected[] = [];
    const write: Expected[] = [];
    for (const caller of CALLERS) {
      read.push(await program(caller, "list-flow-summaries"));
      write.push(await program(caller, "generate-recording-proposal"));
    }
    expect(read).toEqual(["allowed", "allowed", "allowed", "allowed"]);
    expect(write).toEqual(["allowed", "forbidden: Permission required: flows.write", "allowed", "forbidden: Permission required: flows.write"]);
  });
});
