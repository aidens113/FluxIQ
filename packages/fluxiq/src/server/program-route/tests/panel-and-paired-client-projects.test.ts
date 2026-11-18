// @fluxiq-test-group real-sql
// Covers handle-program-request.ts with person-domain-scope.ts and the Automation Studio domain match
// (`projectDomainMatches`): one person sees one set of projects and chats from the web panel (login cookie, no
// `?domainId=`) and from a paired client (token bound to the instance's domain), on an instance whose host serves that
// domain, as `FluxIQ` binds it. Before t915 the panel's requests worked in "no domain" and a paired client's in the
// instance's, so each listed only what it had made itself. Another person's projects and another domain's stay out
// of both, on the hosted `service` profile.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { FluxIQ, FluxIQHostPaths } from "../../../framework/index.ts";
import { IoRegistry } from "../../../io/index.ts";
import { IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../programs/index.ts";
import type { ProgramApiActor } from "../../../programs/_shared/api.ts";
import { fixedPolicySource } from "../../../programs/_shared/tests/iam-registry-fixtures.ts";
import { handleProgramRequest, type ProgramRouteRequest } from "../handle-program-request.ts";

const TOKEN = "pairing-token-secret-value";
const DOMAIN = "example";
const PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];
const PEOPLE = { "cookie-alice": "user.alice", "cookie-bob": "user.bob" } as const;
type Cookie = keyof typeof PEOPLE;
const ALICE = { userId: PEOPLE["cookie-alice"], sessionId: "panel:alice", roleId: "viewer", permissions: PERMISSIONS, channel: "panel" } satisfies ProgramApiActor;

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

type Answer = { status: number; raw: string; body: { ok: boolean; error?: string; errorCode?: string; payload?: any } };

describe("the web panel and a paired client show one person the same projects and chats", () => {
  let root = "";
  let runtime: GlobalProgramRuntime;
  let session: { sessionId: string; operatorUserId: string; metadata: { domainId: string }; projectId: string | null };
  let activeDomainId: string | null;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-shared-projects-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]) } });
    await runtime.identityAccess.upsertUser({ id: PEOPLE["cookie-alice"], username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: PEOPLE["cookie-bob"], username: "bob", displayName: "Bob", roleId: "viewer" });
    session = { sessionId: "g1", operatorUserId: PEOPLE["cookie-alice"], metadata: { domainId: DOMAIN }, projectId: null };
    activeDomainId = null;
  });
  afterEach(async () => {
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  // What `FluxIQ`'s constructor does for an instance whose host serves DOMAIN.
  const serveDomain = () => {
    activeDomainId = DOMAIN;
    runtime.automationStudio.bindIoRuntime(new IoRegistry(), DOMAIN);
  };
  const fluxiq = () => ({
    activeDomainId,
    programs: {
      api: runtime.api,
      automationStudio: runtime.automationStudio,
      secretKeys: runtime.secretKeys,
      clientGateway: { authorizeToken: async (token: string) => (token === TOKEN ? session : null) },
    },
  }) as unknown as FluxIQ;
  const identityAuthority = {
    validateSession: async (sessionId: string) => {
      const userId = PEOPLE[sessionId as Cookie];
      return userId ? { user: { id: userId }, role: { id: "viewer", permissions: PERMISSIONS }, session: { expiresAtMs: Date.now() + 60_000 } } : null;
    },
    snapshot: async () => ({ users: Object.values(PEOPLE).map((id) => ({ id, roleId: "viewer", enabled: true })), roles: [{ id: "viewer", permissions: PERMISSIONS }] }),
  };
  const send = async (caller: "token" | Cookie, endpoint: string, body: unknown): Promise<Answer> => {
    const request: ProgramRouteRequest = {
      method: "POST",
      // The panel's pages carry no `?domainId=`; a paired client's calls carry none either.
      url: `http://127.0.0.1/api/programs/automation-studio/${endpoint}`,
      programId: "automation-studio",
      endpoint,
      sessionId: caller === "token" ? undefined : caller,
      authorization: caller === "token" ? `Bearer ${TOKEN}` : null,
      readJson: async () => JSON.parse(JSON.stringify(body)),
    };
    const response = await handleProgramRequest(request, { fluxiq: fluxiq(), identityAuthority });
    return { status: response.status, raw: response.body, body: JSON.parse(response.body) };
  };
  const created = async (caller: "token" | Cookie, name: string): Promise<string> => {
    const answer = await send(caller, "create-project", { name });
    expect(answer.status, answer.body.error).toBe(200);
    return answer.body.payload.project.id as string;
  };
  const listed = async (caller: "token" | Cookie): Promise<string[]> => {
    const answer = await send(caller, "projects", {});
    expect(answer.status, answer.body.error).toBe(200);
    return (answer.body.payload.projects as Array<{ id: string }>).map((project) => project.id);
  };

  it("lists a project made in the panel to the paired client, and one made by the paired client in the panel", async () => {
    serveDomain();
    const fromPanel = await created("cookie-alice", "Walkthrough A");
    const fromClient = await created("token", "Walkthrough C");
    expect((await listed("token")).sort()).toEqual([fromPanel, fromClient].sort());
    expect((await listed("cookie-alice")).sort()).toEqual([fromPanel, fromClient].sort());
    // The panel's project is stored in the instance's domain, so its Flows are scoped to that domain's nodes.
    expect((await runtime.automationStudio.listProjects(DOMAIN)).projects.map((project) => [project.name, project.domainId]).sort())
      .toEqual([["Walkthrough A", DOMAIN], ["Walkthrough C", DOMAIN]]);
    // A global project made deliberately (a registry call naming no domain, not the panel's route) is still global, and in view.
    const global = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: null }, actor: ALICE, payload: { name: "Global orchestrator" } }) as { ok: boolean; payload?: { project?: { id: string; domainId: string | null } } };
    expect(global.ok).toBe(true);
    expect(global.payload?.project?.domainId).toBeNull();
    expect((await listed("token")).sort()).toEqual([fromPanel, fromClient, global.payload?.project?.id].sort());
  });

  it("shows a chat started in either client in the other's list across projects and in its project", async () => {
    serveDomain();
    const fromPanel = await created("cookie-alice", "Panel project");
    const fromClient = await created("token", "Client project");
    const panelChat = await send("cookie-alice", "open-conversation", { projectId: fromClient, title: "Started in the panel" });
    expect(panelChat.status, panelChat.body.error).toBe(200);
    const clientChat = await send("token", "open-conversation", { projectId: fromPanel, title: "Started in the extension" });
    expect(clientChat.status, clientChat.body.error).toBe(200);
    for (const caller of ["token", "cookie-alice"] as const) {
      const all = await send(caller, "list-conversations", {});
      expect(all.status, `${caller}: ${all.body.error}`).toBe(200);
      expect(all.raw, caller).toContain("Started in the panel");
      expect(all.raw, caller).toContain("Started in the extension");
      const inPanelProject = await send(caller, "list-conversations", { projectId: fromPanel });
      expect(inPanelProject.status, `${caller}: ${inPanelProject.body.error}`).toBe(200);
      expect(inPanelProject.raw, caller).toContain("Started in the extension");
    }
  });

  it("keeps a project the panel made before t915, stored with no domain, visible to both", async () => {
    // Made from the panel while nothing told its route the instance's domain: stored with none, as the panel used to store them.
    const legacy = await created("cookie-alice", "Old panel project");
    expect((await runtime.automationStudio.listProjects(null)).projects.map((project) => project.domainId)).toEqual([null]);
    serveDomain();
    expect(await listed("token")).toEqual([legacy]);
    expect(await listed("cookie-alice")).toEqual([legacy]);
    const chat = await send("token", "open-conversation", { projectId: legacy, title: "Old project chat" });
    expect(chat.status, chat.body.error).toBe(200);
  });

  it("never shows another person's projects or another domain's, from either client", async () => {
    serveDomain();
    const alices = await created("cookie-alice", "Alice's");
    const bobs = await created("cookie-bob", "Bob's");
    const elsewhere = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: "other-domain" }, actor: ALICE, payload: { name: "Elsewhere" } }) as { ok: boolean; payload?: { project?: { id: string } } };
    expect(elsewhere.ok).toBe(true);
    expect(await listed("token")).toEqual([alices]);
    expect(await listed("cookie-alice")).toEqual([alices]);
    expect(await listed("cookie-bob")).toEqual([bobs]);
    const refused = await send("token", "list-conversations", { projectId: elsewhere.payload?.project?.id });
    expect(refused.status).toBe(403);
    expect(refused.body.errorCode).toBe("authorization.project_domain");
    expect((await send("token", "list-conversations", { projectId: bobs })).body.ok).toBe(false);
  });
});
