// Parity over the live registry, at the level that matters: the response of
// `GlobalProgramApiRegistry.call`. Under `local` and `self-hosted` every call
// must be refused exactly when `actor.permissions.includes(permission)` was
// false, for every registration and every kind of actor, including a paired
// client whose permissions are narrowed below its role's. Handlers are
// stubbed, so an allowed call never reaches storage.

import { describe, expect, it } from "vitest";
import type { FluxIQProfile } from "@fluxiq/contracts/platform";
import { createGlobalProgramRuntime } from "../runtime.ts";
import type { ProgramApiActor } from "../api.ts";
import { actor, ADMIN_PERMISSIONS, idsPayload, NO_ID_PAYLOAD, outcomeOf, PAIRED_PERMISSIONS, stubbedRegistry, VIEWER_PERMISSIONS } from "./iam-registry-fixtures.ts";

const ACTORS: Readonly<Record<string, ProgramApiActor>> = {
  admin: actor("admin.one", "admin", ADMIN_PERMISSIONS),
  viewer: actor("viewer.one", "viewer", VIEWER_PERMISSIONS),
  pairedAdmin: actor("admin.one", "admin", ADMIN_PERMISSIONS.filter((permission) => PAIRED_PERMISSIONS.includes(permission)), "paired-client"),
  pairedViewer: actor("viewer.one", "viewer", VIEWER_PERMISSIONS, "paired-client"),
  editedViewer: actor("viewer.two", "viewer", ["programs.read", "programs.write", "flows.write"]),
  unmappedRole: actor("custom.one", "operator", ["programs.read", "runtime.control", "compute.control"]),
  userRole: actor("user.one", "user", ["programs.read", "programs.write"])
};

const PAYLOADS: Readonly<Record<string, unknown>> = { noIds: NO_ID_PAYLOAD, ids: idsPayload("p-") };

describe("IAM parity of the live program registry, call by call", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();

  it("refuses a call under local and self-hosted exactly when the actor lacks the endpoint's permission", async () => {
    const mismatches: unknown[] = [];
    const byActor: Record<string, { allows: number; denies: number }> = {};
    let decisions = 0;
    for (const profile of ["local", "self-hosted"] as const satisfies readonly FluxIQProfile[]) {
      const registry = stubbedRegistry(endpoints, { profile });
      for (const [name, who] of Object.entries(ACTORS)) {
        const counts = (byActor[name] ??= { allows: 0, denies: 0 });
        for (const endpoint of endpoints) {
          const today = who.permissions.includes(endpoint.permission) ? "allow" : "deny";
          for (const [payloadName, payload] of Object.entries(PAYLOADS)) {
            const response = await registry.call({ programId: endpoint.programId, endpoint: endpoint.endpoint, scope: {}, actor: who, payload });
            const iam = outcomeOf(response);
            decisions += 1;
            if (iam === "allow") counts.allows += 1;
            else counts.denies += 1;
            if (iam !== today) mismatches.push({ profile, actor: name, payload: payloadName, programId: endpoint.programId, endpoint: endpoint.endpoint, permission: endpoint.permission, today, iam, error: response.error });
          }
        }
      }
    }
    const summary = { registrations: endpoints.length, actors: Object.keys(ACTORS), profiles: ["local", "self-hosted"], payloads: Object.keys(PAYLOADS), decisions, byActor, mismatches: mismatches.length, firstMismatches: mismatches.slice(0, 20) };
    console.info(JSON.stringify(summary));
    expect(decisions).toBe(endpoints.length * Object.keys(ACTORS).length * 2 * Object.keys(PAYLOADS).length);
    expect(byActor.admin?.denies).toBe(0);
    expect(mismatches, JSON.stringify(mismatches.slice(0, 20))).toEqual([]);
  });
});
