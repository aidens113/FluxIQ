// @fluxiq-test-group real-sql
// Covers handlers/across-projects.ts through the real runtime on the hosted (`service`) IAM profile: with two people
// each owning a project, each cross-project read answers only the caller's own projects' runs and Flows, never the
// other person's, and a paired client's bearer token is refused before any project is read.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FluxIQ, FluxIQHostPaths } from "../../../../../../framework/index.ts";
import type { AutomationStudioService } from "../../../../../../framework/automation-service/index.ts";
import { IAM_USER_ACCESS } from "../../../../../../platform/iam/predefined/index.ts";
import { handleProgramRequest } from "../../../../../../server/program-route/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../../../index.ts";
import type { ProgramApiActor } from "../../../../../_shared/api.ts";
import { fixedPolicySource } from "../../../../../_shared/tests/iam-registry-fixtures.ts";

const DOMAIN = "example";
const TOKEN = "pairing-token-secret-value";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "user.alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;
const BOB = { ...ALICE, userId: "user.bob", sessionId: "panel:bob" } satisfies ProgramApiActor;

function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  const at = (name: string) => path.join(fluxiq, name);
  return {
    root, fluxiq, config: at("fluxiq.json"), data: at("data"), databases: at("databases"), inputs: at("inputs"), outputs: at("outputs"),
    streams: at("streams"), domains: at("domains"), domainPrograms: at("domain-programs"), domainInputs: at("domain-inputs"),
    domainOutputs: at("domain-outputs"), domainConfigs: at("domain-configs"), domainData: at("domain-data"), domainDatabases: at("domain-databases"),
    recordings: at("recordings"), policies: at("policies"), logs: at("logs"), temp: at("temp"),
  };
}

type RunSummary = Awaited<ReturnType<AutomationStudioService["listFlowRunSummaries"]>>["runs"][number];

const finishedRun = (projectId: string): RunSummary => ({
  schemaVersion: "0.1", runId: `run.of.${projectId}`, flowId: "f", projectId, status: "succeeded", updatedAt: 1,
  routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0,
});

type Answer = { ok: boolean; error?: string; errorCode?: string; payload?: any };

describe("the cross-project reads, decided through the runtime's IAM", () => {
  let root = "";
  let runtime: GlobalProgramRuntime;
  let alicesProject = "";
  let bobsProject = "";

  const call = async (actor: ProgramApiActor, endpoint: string, payload: Record<string, unknown> = {}, domainId: string = DOMAIN): Promise<Answer> =>
    await runtime.api.call({ programId: "automation-studio", endpoint, scope: { domainId }, actor, payload }) as Answer;
  const made = async (actor: ProgramApiActor, name: string): Promise<string> => {
    const answer = await call(actor, "create-project", { name });
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-across-projects-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: BOB.userId, username: "bob", displayName: "Bob", roleId: "viewer" });
    alicesProject = await made(ALICE, "Alice's project");
    bobsProject = await made(BOB, "Bob's project");
    for (const [actor, projectId, name] of [[ALICE, alicesProject, "Alice's Flow"], [BOB, bobsProject, "Bob's Flow"]] as const) {
      const created = await call(actor, "create-flow", { projectId, name });
      expect(created.ok, created.error).toBe(true);
    }
    // Run history needs finished runs; the service's page read is answered per project, as the store would.
    vi.spyOn(runtime.automationStudio, "listFlowRunSummaries").mockImplementation(async (input) => ({ runs: [finishedRun(input.projectId)], total: 1, limit: 100, offset: 0 }));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it("answers each person only the runs of the projects they may read", async () => {
    for (const [actor, own, other] of [[ALICE, alicesProject, bobsProject], [BOB, bobsProject, alicesProject]] as const) {
      const answer = await call(actor, "list-recent-flow-runs");
      expect(answer.ok, answer.error).toBe(true);
      expect(answer.payload.runs.map((run: { runId: string; projectId: string }) => [run.runId, run.projectId])).toEqual([[`run.of.${own}`, own]]);
      expect(JSON.stringify(answer)).not.toContain(other);
    }
  });

  it("answers each person only the Flows of the projects they may read", async () => {
    for (const [actor, own, ownName, other, otherName] of [[ALICE, alicesProject, "Alice's Flow", bobsProject, "Bob's Flow"], [BOB, bobsProject, "Bob's Flow", alicesProject, "Alice's Flow"]] as const) {
      const answer = await call(actor, "list-workspace-flow-summaries");
      expect(answer.ok, answer.error).toBe(true);
      expect(answer.payload.flows.map((flow: { name: string; projectId: string }) => [flow.name, flow.projectId])).toEqual([[ownName, own]]);
      expect(JSON.stringify(answer)).not.toContain(other);
      expect(JSON.stringify(answer)).not.toContain(otherName);
    }
  });

  it("shows a person nothing from a domain they have no project in", async () => {
    const answer = await call(ALICE, "list-workspace-flow-summaries", {}, "other-domain");
    expect(answer).toMatchObject({ ok: true, payload: { flows: [] } });
  });

  it("refuses a paired client's token on both reads before any project is read", async () => {
    const session = { sessionId: "g1", operatorUserId: ALICE.userId, metadata: { domainId: DOMAIN }, projectId: alicesProject };
    const fluxiq = { programs: { api: runtime.api, automationStudio: runtime.automationStudio, clientGateway: { authorizeToken: async (token: string) => (token === TOKEN ? session : null) } } } as unknown as FluxIQ;
    const identityAuthority = {
      validateSession: async () => null,
      snapshot: async () => ({ users: [{ id: ALICE.userId, roleId: "viewer", enabled: true }], roles: [{ id: "viewer", permissions: PERMISSIONS }] }),
    };
    const listProjects = vi.spyOn(runtime.automationStudio, "listProjects");
    for (const endpoint of ["list-recent-flow-runs", "list-workspace-flow-summaries"]) {
      const response = await handleProgramRequest({
        method: "POST", url: `http://127.0.0.1/api/programs/automation-studio/${endpoint}`, programId: "automation-studio", endpoint,
        sessionId: undefined, authorization: `Bearer ${TOKEN}`, readJson: async () => ({}),
      }, { fluxiq, identityAuthority });
      const body = JSON.parse(response.body);
      expect(response.status, endpoint).toBeGreaterThanOrEqual(400);
      expect(body.ok, endpoint).toBe(false);
      expect(response.body).not.toContain(alicesProject);
    }
    expect(listProjects).not.toHaveBeenCalled();
  });
});
