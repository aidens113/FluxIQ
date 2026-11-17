// Covers handle-program-request.ts on a guarded host: a paired client's call binds its project once, from its first
// authentication, so a `client.focus_project` that moves the session between the route's two authentications does
// not fail the call in flight, while a call reaching a project its caller may not is still refused.
import { describe, expect, it } from "vitest";
import { handleProgramRequest } from "../handle-program-request.ts";
import { authorityHarness, deferred, TOKEN } from "./authority-revalidation-fixture.ts";

const bearer = { sessionId: undefined, authorization: `Bearer ${TOKEN}` } as const;

/** The harness, with `list-conversations` (a read whose body may name no project) reachable by token. */
function harness() {
  const h = authorityHarness();
  const api = h.context.fluxiq.programs.api as unknown as { endpoints: () => Array<{ programId: string; endpoint: string; classification: string }> };
  const listed = api.endpoints;
  api.endpoints = () => [...listed(), { programId: "automation-studio", endpoint: "list-conversations", classification: "read" }];
  const listConversations = (readJson: () => Promise<unknown>) => h.request({
    ...bearer,
    url: "https://panel.example.test/api/programs/automation-studio/list-conversations",
    endpoint: "list-conversations",
    readJson
  });
  return { ...h, listConversations };
}

describe("a paired call's project is bound once", () => {
  it("is not failed by a focus that lands while its body is read, and acts on the project it was bound to", async () => {
    const h = harness();
    const entered = deferred<void>();
    const body = deferred<unknown>();
    const pending = handleProgramRequest(h.listConversations(() => {
      entered.resolve();
      return body.promise;
    }), h.context);
    await entered.promise;
    h.state.session = { ...h.state.session!, projectId: "project-two" };
    body.resolve({});

    expect((await pending).status).toBe(200);
    expect(h.authorizeToken).toHaveBeenCalledTimes(2);
    // Gated on the project it was bound to; the body names none, so nothing is added to it.
    expect(h.domain.mock.calls).toEqual([["project-one", "domain-one"]]);
    expect(h.call).toHaveBeenCalledOnce();
    expect(h.call.mock.calls[0]?.[0].payload).toEqual({});
  });

  it("is not failed by a focus that lands while a call naming its project is read", async () => {
    const h = harness();
    const request = h.request({ ...bearer, readJson: async () => {
      h.state.session = { ...h.state.session!, projectId: "project-two" };
      return { projectId: "project-one", flowId: "flow-one" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(200);
    expect(h.domain.mock.calls).toEqual([["project-one", "domain-one"]]);
    expect(h.call).toHaveBeenCalledOnce();
  });

  it("is not failed by a focus that lands while its project's domain is checked", async () => {
    const h = harness();
    const entered = deferred<void>();
    const domain = deferred<void>();
    h.domain.mockImplementation(() => {
      entered.resolve();
      return domain.promise;
    });
    const pending = handleProgramRequest(h.listConversations(async () => ({})), h.context);
    await entered.promise;
    h.state.session = { ...h.state.session!, projectId: "project-two" };
    domain.resolve();

    expect((await pending).status).toBe(200);
    expect(h.call).toHaveBeenCalledOnce();
  });

  it("still refuses a project outside the caller's reach, focused away meanwhile or not", async () => {
    for (const moves of [false, true]) {
      const h = harness();
      h.domain.mockImplementation(async (projectId: string) => {
        if (projectId !== "project-one") throw new Error("Automation Studio project is unavailable in this domain scope.");
      });
      const request = h.request({ ...bearer, readJson: async () => {
        if (moves) h.state.session = { ...h.state.session!, projectId: "project-elsewhere" };
        return { projectId: "project-elsewhere", flowId: "flow-one" };
      } });
      const answer = await handleProgramRequest(request, h.context);
      expect(answer.status, String(moves)).toBe(403);
      expect(JSON.parse(answer.body)).toEqual(expect.objectContaining({ ok: false, errorCode: "authorization.project_domain" }));
      expect(h.call).not.toHaveBeenCalled();
    }
  });

  it("still refuses a call whose caller changed between the authentications", async () => {
    const h = harness();
    const request = h.request({ ...bearer, readJson: async () => {
      h.state.session = { ...h.state.session!, projectId: "project-two", trustedClientId: "trust-two" };
      return { projectId: "project-one", flowId: "flow-one" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(401);
    expect(h.call).not.toHaveBeenCalled();
  });
});
