// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with program-route.ts: a paired client's token listing and making projects and
// chatting in any project its approving person may use, through the whole route on the hosted (`service`) IAM
// profile, against the real registry and store. Another person's project, another domain's and another tenant's
// are refused; renaming and deleting a project stay the signed-in person's alone.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FluxIQ, FluxIQHostPaths } from "../../../framework/index.ts";
import { AutomationStudioService } from "../../../framework/automation-service/index.ts";
import { IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../programs/index.ts";
import type { ProgramApiActor } from "../../../programs/_shared/api.ts";
import { fixedPolicySource } from "../../../programs/_shared/tests/iam-registry-fixtures.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

const TOKEN = "pairing-token-secret-value";
const DOMAIN = "example";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const ALICE = { userId: "user.alice", sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;
const BOB = { ...ALICE, userId: "user.bob", sessionId: "panel:bob" } satisfies ProgramApiActor;

// Every path. The config is not named `config.json`, so the runtime takes the plain data-directory layout (as the
// handler suites' disposable service does) rather than layout v2, which needs a provisioned workspace.
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

const spyOnCall = (runtime: GlobalProgramRuntime) => vi.spyOn(runtime.api, "call");

type Answer = { status: number; raw: string; body: { ok: boolean; error?: string; errorCode?: string; payload?: any } };

describe("a paired client's projects, through the program route on the service profile", () => {
  let root = "";
  let runtime: GlobalProgramRuntime;
  let session: { sessionId: string; operatorUserId: string; metadata: { domainId: string }; projectId: string | null };
  let call: ReturnType<typeof spyOnCall>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-paired-projects-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: BOB.userId, username: "bob", displayName: "Bob", roleId: "viewer" });
    session = { sessionId: "g1", operatorUserId: ALICE.userId, metadata: { domainId: DOMAIN }, projectId: null };
    call = spyOnCall(runtime);
  });
  afterEach(async () => {
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const fluxiq = () => ({
    programs: {
      api: runtime.api,
      automationStudio: runtime.automationStudio,
      clientGateway: { authorizeToken: async (token: string) => (token === TOKEN ? session : null) },
    },
  }) as unknown as FluxIQ;
  const identityAuthority = {
    validateSession: async () => null,
    snapshot: async () => ({ users: [{ id: ALICE.userId, roleId: "viewer", enabled: true }, { id: BOB.userId, roleId: "viewer", enabled: true }], roles: [{ id: "viewer", permissions: PERMISSIONS }] }),
  };
  const send = async (endpoint: string, body: unknown, method: "GET" | "POST" = "POST"): Promise<Answer> => {
    const request: ProgramRouteRequest = {
      method,
      url: `http://127.0.0.1/api/programs/automation-studio/${endpoint}`,
      programId: "automation-studio",
      endpoint,
      sessionId: undefined,
      authorization: `Bearer ${TOKEN}`,
      readJson: async () => (body === undefined ? undefined : JSON.parse(JSON.stringify(body))),
    };
    const response = await handleProgramRequest(request, { fluxiq: fluxiq(), identityAuthority });
    return { status: response.status, raw: response.body, body: JSON.parse(response.body) };
  };
  // A project made by its owner's own login, so the registry records who owns it.
  const made = async (actor: ProgramApiActor, name: string, domainId: string = DOMAIN): Promise<string> => {
    const answer = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId }, actor, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };

  it("lists the person's own projects in the bound domain, newest first, as id, name and last change alone", async () => {
    const older = await made(ALICE, "Older");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await made(ALICE, "Newer");
    await made(BOB, "Bob's");
    await made(ALICE, "Elsewhere", "other-domain");
    session.projectId = older;
    for (const method of ["POST", "GET"] as const) {
      const listed = await send("projects", method === "GET" ? undefined : { projectId: "ignored", includeOwners: true }, method);
      expect(listed.status, listed.body.error).toBe(200);
      expect(listed.body).toEqual({ ok: true, payload: { projects: [{ id: newer, name: "Newer", updatedAt: expect.any(Number) }, { id: older, name: "Older", updatedAt: expect.any(Number) }] } });
      for (const leaked of [ALICE.userId, BOB.userId, "ownerUserId", "Bob's", "Elsewhere", "categories"]) expect(listed.raw, leaked).not.toContain(leaked);
    }
    // The handler did answer owners; the route cut them out on the way back.
    expect(JSON.stringify(await call.mock.results.at(-1)?.value)).toContain(ALICE.userId);
  });

  it("still lists when the session's project is gone, so the client can choose another", async () => {
    const own = await made(ALICE, "Own");
    session.projectId = "project.deleted";
    const listed = await send("projects", {});
    expect(listed.status, listed.body.error).toBe(200);
    expect(listed.body.payload.projects.map((project: { id: string }) => project.id)).toEqual([own]);
  });

  it("makes a project from its name alone, in the bound domain, owned by the approving person", async () => {
    const created = await send("create-project", { name: "  Shop  ", description: "from token", categoryId: "category.someone", domainId: "other-domain", authorizationPin: "1234", authSessionId: "s" });
    expect(created.status, created.body.error).toBe(200);
    expect(created.body).toEqual({ ok: true, payload: { project: { id: expect.any(String), name: "Shop", updatedAt: expect.any(Number) } } });
    expect(call.mock.calls[0]?.[0].payload).toEqual({ name: "  Shop  " });
    const stored = (await runtime.automationStudio.listProjects(DOMAIN)).projects;
    expect(stored).toEqual([expect.objectContaining({ id: created.body.payload.project.id, name: "Shop", description: "", categoryId: null, domainId: DOMAIN })]);
    // Its owner is the approving person: Alice's token lists it, and Bob's login cannot rename it.
    expect((await send("projects", {})).body.payload.projects.map((project: { id: string }) => project.id)).toEqual([created.body.payload.project.id]);
    const bobRename = await runtime.api.call({ programId: "automation-studio", endpoint: "update-project", scope: { domainId: DOMAIN }, actor: BOB, payload: { projectId: created.body.payload.project.id, name: "Taken" } });
    expect(bobRename.ok).toBe(false);
  });

  it("refuses a nameless or empty new project, and makes nothing", async () => {
    expect((await send("create-project", { description: "no name" })).status).toBe(403);
    const empty = await send("create-project", { name: "  " });
    expect(empty.body.ok).toBe(false);
    expect((await runtime.automationStudio.listProjects(DOMAIN)).projects).toEqual([]);
  });

  it("keeps renaming and deleting a project, and its categories, the signed-in person's alone", async () => {
    const own = await made(ALICE, "Own");
    call.mockClear();
    for (const endpoint of ["update-project", "delete-project", "create-project-category", "delete-project-category"]) {
      const refused = await send(endpoint, { projectId: own, name: "Renamed" });
      expect(refused.status, endpoint).toBe(403);
      expect(refused.body.error).toBe("This endpoint is not available to a paired client.");
    }
    expect(call).not.toHaveBeenCalled();
    expect((await runtime.automationStudio.listProjects(DOMAIN)).projects).toEqual([expect.objectContaining({ id: own, name: "Own" })]);
  });

  it("chats and reads Flows in any of the person's projects by naming it, whatever the session's project is", async () => {
    const first = await made(ALICE, "First");
    const second = await made(ALICE, "Second");
    session.projectId = first;
    const opened = await send("open-conversation", { projectId: second, title: "In second" });
    expect(opened.status, opened.body.error).toBe(200);
    const conversationId = opened.body.payload.conversation.conversationId ?? opened.body.payload.conversation.id;
    expect(typeof conversationId).toBe("string");
    const appended = await send("append-turn", { projectId: second, conversationId, text: "Hello from the extension" });
    expect(appended.status, appended.body.error).toBe(200);
    const read = await send("get-conversation", { projectId: second, conversationId });
    expect(read.status, read.body.error).toBe(200);
    expect(read.raw).toContain("Hello from the extension");
    const listed = await send("list-conversations", { projectId: second });
    expect(listed.status, listed.body.error).toBe(200);
    expect(listed.raw).toContain(conversationId);
    expect((await send("list-conversations", { projectId: first })).raw).not.toContain(conversationId);
    for (const [endpoint, body] of [["list-flow-summaries", { projectId: second }], ["list-project-tasks", { projectId: second }]] as const) {
      const answer = await send(endpoint, body);
      expect(answer.status, `${endpoint}: ${answer.body.error}`).toBe(200);
    }
  });

  it("refuses another person's project, another domain's, and another tenant's, by id", async () => {
    const own = await made(ALICE, "Own");
    const bobs = await made(BOB, "Bob's");
    const elsewhere = await made(ALICE, "Elsewhere", "other-domain");
    const tenantRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-paired-projects-tenant-"));
    const otherTenant = new AutomationStudioService({ dataDir: path.join(tenantRoot, ".fluxiq", "data"), seedFixture: false });
    try {
      const foreign = (await otherTenant.createProject({ name: "Other tenant", domainId: DOMAIN })).id;
      session.projectId = own;
      for (const endpoint of ["open-conversation", "list-conversations", "list-flow-summaries"]) {
        const asBob = await send(endpoint, { projectId: bobs });
        expect(asBob.body.ok, `${endpoint} on another person's project`).toBe(false);
        expect(asBob.raw).not.toContain("Bob's");
        for (const projectId of [elsewhere, foreign]) {
          const refused = await send(endpoint, { projectId });
          expect(refused.status, `${endpoint} on ${projectId === foreign ? "another tenant's" : "another domain's"} project`).toBe(403);
          expect(refused.body.errorCode).toBe("authorization.project_domain");
        }
      }
      // A list across projects holds only the person's own threads in the bound domain.
      await send("open-conversation", { projectId: own, title: "Mine" });
      await runtime.api.call({ programId: "automation-studio", endpoint: "open-conversation", scope: { domainId: DOMAIN }, actor: BOB, payload: { projectId: bobs, title: "Bob's thread" } });
      session.projectId = null;
      const all = await send("list-conversations", {});
      expect(all.status, all.body.error).toBe(200);
      expect(all.raw).toContain("Mine");
      expect(all.raw).not.toContain("Bob's thread");
    } finally {
      await otherTenant.close();
      await rm(tenantRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
