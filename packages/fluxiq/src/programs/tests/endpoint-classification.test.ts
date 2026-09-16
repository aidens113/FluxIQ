// The PIN guards destruction, not authorship. TypeScript already refuses a
// registration with no `classification`, so this suite does not police
// coverage; it pins the two sets where the classification is a security
// statement, so reclassifying an endpoint is a deliberate, reviewable edit
// rather than a one-word change nobody sees.

import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../_shared/runtime.ts";
import type { ProgramEndpointClassification } from "../_shared/api.ts";

/** Endpoints `registry.call()` will not run without the operator's session PIN. */
const PIN_GATED = [
  "automation-studio/delete-flow",
  "automation-studio/delete-flow-map-route-group",
  "automation-studio/delete-flow-subflow",
  "automation-studio/delete-project",
  "automation-studio/delete-project-artifact",
  "automation-studio/delete-project-category",
  "automation-studio/delete-proposal",
  "automation-studio/delete-recording",
  "automation-studio/delete-recordings",
  "automation-studio/delete-run-datasets",
  "automation-studio/execute-client-action",
  "automation-studio/rollback-flow-migration",
  "automation-studio/seal-legacy-writes"
];

/**
 * Destructive endpoints nothing gates. Each is a declared gap, recorded in
 * `docs/architecture/automation-studio/persistence.md`: no operator auth
 * session reaches these programs, so a PIN could never be supplied to them.
 */
const DECLARED_UNGATED = [
  "database-manager/run-migration",
  "deployment-sync/rollback",
  "deployment-sync/sync"
];

const CLASSIFICATIONS: ProgramEndpointClassification[] = ["read", "authoring", "destructive", "program-gated", "destructive-ungated"];

describe("global program endpoint classification", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();
  const named = (classification: ProgramEndpointClassification) =>
    endpoints.filter((endpoint) => endpoint.classification === classification)
      .map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`)
      .sort();

  it("declares one of the known classifications for every registered endpoint", () => {
    expect(endpoints.length).toBeGreaterThan(200);
    for (const endpoint of endpoints) {
      expect(CLASSIFICATIONS, `${endpoint.programId}/${endpoint.endpoint}`).toContain(endpoint.classification);
    }
  });

  it("gates exactly the endpoints that remove persisted data or act irreversibly outside", () => {
    expect(named("destructive")).toEqual([...PIN_GATED].sort());
  });

  it("records exactly the destructive endpoints that no credential gates", () => {
    expect(named("destructive-ungated")).toEqual([...DECLARED_UNGATED].sort());
  });

  it("leaves every read endpoint free of a credential beyond its permission", () => {
    for (const endpoint of endpoints.filter((candidate) => candidate.classification === "read")) {
      expect(endpoint.permission, `${endpoint.programId}/${endpoint.endpoint}`).not.toBe("identity.manage");
      expect(endpoint.permission, `${endpoint.programId}/${endpoint.endpoint}`).not.toBe("secrets.manage");
    }
  });

  it("keeps flow authoring un-gated, so an unattended loop can build and edit Flows", () => {
    const authoring = new Set(named("authoring"));
    for (const endpoint of [
      "automation-studio/create-flow",
      "automation-studio/save-flow",
      "automation-studio/apply-graph-patch",
      "automation-studio/update-flow-settings",
      "automation-studio/create-flow-subflow",
      "automation-studio/update-flow-subflow",
      "automation-studio/review-flow-adaptation",
      "automation-studio/publish-flow"
    ]) {
      expect(authoring, endpoint).toContain(endpoint);
    }
  });

  // The workspace hierarchy is filing, not data. Both endpoints write only
  // `customHierarchyNodes` and `deletedHierarchyIds`; deleting a node leaves every
  // Flow, recording, project and dataset in place and merely unfiled. The delete is
  // an autosave path that fires while the operator drags items around, so gating it
  // would raise a PIN prompt during ordinary editing and train people to type the
  // PIN reflexively. The bulk save is pinned alongside it because the granular
  // delete can remove the same nodes one at a time, so gating only the bulk path
  // would be a bypass, and gating only the granular one would be theatre.
  it("keeps workspace filing un-gated, so rearranging the workspace never raises a prompt", () => {
    const authoring = new Set(named("authoring"));
    for (const endpoint of [
      "automation-studio/save-project-hierarchy",
      "automation-studio/put-project-hierarchy-node",
      "automation-studio/delete-project-hierarchy-node"
    ]) {
      expect(authoring, endpoint).toContain(endpoint);
    }
  });

  it("keeps revocation un-gated, so cutting off access never waits behind a prompt", () => {
    const authoring = new Set(named("authoring"));
    for (const endpoint of ["identity-access/revoke-session", "identity-access/lock-vault", "automation-studio/revoke-client-trust"]) {
      expect(authoring, endpoint).toContain(endpoint);
    }
  });
});
