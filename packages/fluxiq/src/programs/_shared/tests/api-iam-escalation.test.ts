// Escalation over the live registry under `service`: two users who both hold
// only `FluxIQUserAccess`. Bob must be refused Alice's projects through every
// registration that acts on a project or its children, every operator
// endpoint, and the identity actions that reach other users; Alice keeps her
// own; a filtered list shows each only their own items. Handlers are stubbed.

import { describe, expect, it } from "vitest";
import { iamActionName } from "@fluxiq/contracts/iam";
import { iamProgramService } from "../../../platform/iam/catalog/index.ts";
import { IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import type { ProgramApiEndpointSummary, ProgramApiHandler } from "../api.ts";
import type { ProgramResourceRef } from "../iam/index.ts";
import { createGlobalProgramRuntime } from "../runtime.ts";
import { actor, ADMIN_PERMISSIONS, fixedPolicySource, idsPayload, NO_ID_PAYLOAD, outcomeOf, registerPrefixOwners, stubbedRegistry } from "./iam-registry-fixtures.ts";

const alice = actor("alice", "user", ADMIN_PERMISSIONS);
const bob = actor("bob", "user", ADMIN_PERMISSIONS);

const actionOf = (endpoint: ProgramApiEndpointSummary): string => iamActionName(iamProgramService(endpoint.programId), endpoint.endpoint);

const actsOnProject = (endpoint: ProgramApiEndpointSummary): boolean => (endpoint.resource?.types ?? []).some((type) => type === "project" || type.startsWith("project/"));

// The live `projects` handler answers three projects, one per owner; every
// other registration answers success with an empty payload.
const PROJECTS = [{ id: "a-1", name: "Alice's" }, { id: "b-1", name: "Bob's" }, { id: "x-1", name: "Nobody's" }];
const handlerFor = (endpoint: ProgramApiEndpointSummary): ProgramApiHandler =>
  endpoint.programId === "automation-studio" && endpoint.endpoint === "projects" ? () => ({ ok: true, payload: { projects: PROJECTS } }) : () => ({ ok: true, payload: {} });

describe("FluxIQUserAccess under service, over the live registry", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();
  const registry = stubbedRegistry(endpoints, { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) }, handlerFor);
  registerPrefixOwners(registry);
  const callAs = (who: typeof alice, endpoint: ProgramApiEndpointSummary, payload: unknown) => registry.call({ programId: endpoint.programId, endpoint: endpoint.endpoint, scope: {}, actor: who, payload });

  it("refuses Bob Alice's project through every project and project-child registration, and allows Alice", async () => {
    const projectEndpoints = endpoints.filter(actsOnProject);
    const escalations: string[] = [];
    const ownRefused: string[] = [];
    for (const endpoint of projectEndpoints) {
      const asBob = await callAs(bob, endpoint, idsPayload("a-"));
      if (outcomeOf(asBob) !== "deny") escalations.push(`${endpoint.programId}/${endpoint.endpoint}: ${outcomeOf(asBob)}`);
      const asAlice = await callAs(alice, endpoint, idsPayload("a-"));
      if (outcomeOf(asAlice) !== "allow") ownRefused.push(`${endpoint.programId}/${endpoint.endpoint}: ${asAlice.error ?? ""}`);
    }
    console.info(JSON.stringify({ projectRegistrations: projectEndpoints.length, escalations: escalations.length, ownRefused: ownRefused.length, firstOwnRefused: ownRefused.slice(0, 20) }));
    expect(projectEndpoints.length).toBeGreaterThan(0);
    expect(escalations).toEqual([]);
    expect(ownRefused).toEqual([]);
  });

  it("refuses every operator endpoint and the identity actions that reach other users", async () => {
    const reached: string[] = [];
    const targets = endpoints.filter((endpoint) => actionOf(endpoint).startsWith("ops:") || ["iam:Snapshot", "iam:CreateUser", "iam:UpdateUser"].includes(actionOf(endpoint)));
    for (const endpoint of targets) {
      for (const payload of [NO_ID_PAYLOAD, idsPayload("a-"), idsPayload("b-")]) {
        const response = await callAs(bob, endpoint, payload);
        if (outcomeOf(response) !== "deny") reached.push(`${endpoint.programId}/${endpoint.endpoint}`);
      }
    }
    console.info(JSON.stringify({ operatorAndIdentityTargets: targets.length, reached }));
    expect(targets.map(actionOf).filter((action) => action.startsWith("iam:")).sort()).toEqual(["iam:CreateUser", "iam:Snapshot", "iam:UpdateUser"]);
    expect(reached).toEqual([]);
  });

  it("shows each user only their own projects", async () => {
    const projects = endpoints.find((endpoint) => endpoint.programId === "automation-studio" && endpoint.endpoint === "projects");
    expect(projects?.list, "automation-studio/projects declares a list filter").toBeDefined();
    if (projects === undefined) return;
    await expect(callAs(alice, projects, NO_ID_PAYLOAD)).resolves.toEqual({ ok: true, payload: { projects: [PROJECTS[0]] } });
    await expect(callAs(bob, projects, NO_ID_PAYLOAD)).resolves.toEqual({ ok: true, payload: { projects: [PROJECTS[1]] } });
  });

  it("lets a user call every filtered list that spans the workspace", async () => {
    const refused: string[] = [];
    const lists = endpoints.filter((endpoint) => endpoint.list !== undefined && workspaceWide(endpoint));
    for (const endpoint of lists) {
      if (outcomeOf(await callAs(bob, endpoint, NO_ID_PAYLOAD)) !== "allow") refused.push(actionOf(endpoint));
    }
    console.info(JSON.stringify({ filteredWorkspaceLists: lists.map(actionOf), refused }));
    expect(refused, "add these to FILTERED_WORKSPACE_LISTS in platform/iam/predefined/user-access.ts").toEqual([]);
  });

  it("refuses a user every unfiltered action on the workspace except a create", async () => {
    const reached: string[] = [];
    const targets = endpoints.filter((endpoint) => endpoint.list === undefined && workspaceWide(endpoint) && !/:Create[A-Z]/u.test(actionOf(endpoint)));
    for (const endpoint of targets) {
      if (outcomeOf(await callAs(bob, endpoint, NO_ID_PAYLOAD)) === "allow") reached.push(actionOf(endpoint));
    }
    console.info(JSON.stringify({ unfilteredWorkspaceTargets: targets.length, reached }));
    expect(targets.length).toBeGreaterThan(0);
    expect(reached).toEqual([]);
  });
});

function workspaceWide(endpoint: ProgramApiEndpointSummary): boolean {
  const refs = endpoint.resource?.of({ programId: endpoint.programId, endpoint: endpoint.endpoint, scope: {}, payload: NO_ID_PAYLOAD });
  const list = refs === undefined ? [] : ([] as ProgramResourceRef[]).concat(refs);
  return list.length > 0 && list.every((ref) => ref.kind === "workspace");
}
