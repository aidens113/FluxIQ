import { afterEach, describe, expect, it, vi } from "vitest";
import { handleProgramRequest } from "../handle-program-request.ts";
import { authorityHarness, COOKIE, deferred, panelAuth, TOKEN } from "./authority-revalidation-fixture.ts";

afterEach(() => { vi.restoreAllMocks(); });

describe("guarded buffered program authority", () => {
  it("refuses an initial tenant guard before presentation, body or dispatch", async () => {
    const h = authorityHarness();
    h.state.eligible = false;
    const request = h.request();
    expect((await handleProgramRequest(request, h.context)).status).toBe(401);
    expect(h.present).not.toHaveBeenCalled();
    expect(request.readJson).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it("refuses an initial bearer guard before inspecting the gateway credential", async () => {
    const h = authorityHarness();
    h.state.eligible = false;
    const request = h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}` });
    expect((await handleProgramRequest(request, h.context)).status).toBe(401);
    expect(h.authorizeToken).not.toHaveBeenCalled();
    expect(request.readJson).not.toHaveBeenCalled();
    expect(h.call).not.toHaveBeenCalled();
  });

  it("a request body cannot replace or remove the server guard", async () => {
    const h = authorityHarness();
    const request = h.request({ readJson: async () => {
      h.state.eligible = false;
      return { projectId: "project-one", flowId: "flow-one", revalidateAuthority: true, identityAuthority: "caller" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(401);
    expect(h.present).toHaveBeenCalledTimes(1);
    expect(h.call).not.toHaveBeenCalled();
  });

  it.each(["session", "membership", "user"])("rejects %s revoked while a cookie body is pending without bearer fallback", async (kind) => {
    const h = authorityHarness();
    const entered = deferred<void>();
    const body = deferred<unknown>();
    const pending = handleProgramRequest(h.request({ authorization: `Bearer ${TOKEN}`, readJson: () => {
      entered.resolve();
      return body.promise;
    } }), h.context);
    await entered.promise;
    if (kind === "session") h.state.auth = null;
    if (kind === "membership") h.state.eligible = false;
    if (kind === "user") h.state.auth = panelAuth("person-two");
    body.resolve({ projectId: "project-one", flowId: "flow-one" });
    expect((await pending).status).toBe(401);
    expect(h.authorizeToken).not.toHaveBeenCalled();
    expect(h.present).toHaveBeenCalledTimes(1);
    expect(h.call).not.toHaveBeenCalled();
  });

  it("uses current cookie role permissions for the unchanged caller and presents keys only once", async () => {
    const h = authorityHarness();
    const request = h.request({ readJson: async () => {
      h.state.auth = panelAuth("person-one", ["programs.read"], "reader");
      return { projectId: "project-one", flowId: "flow-one" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(200);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ roleId: "reader", permissions: ["programs.read"], channel: "panel" }) }));
    expect(h.guard).toHaveBeenCalledTimes(3);
    expect(h.present).toHaveBeenCalledTimes(1);
  });

  it.each(["token", "owner", "role", "session", "trust", "client", "type", "domain", "project"])("rejects paired %s changes during a body await", async (kind) => {
    const h = authorityHarness();
    const entered = deferred<void>();
    const body = deferred<unknown>();
    const pending = handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, readJson: () => {
      entered.resolve();
      return body.promise;
    } }), h.context);
    await entered.promise;
    const session = h.state.session!;
    if (kind === "token") h.state.session = null;
    if (kind === "owner") h.state.users = [];
    if (kind === "role") h.state.roles = [];
    if (kind === "session") h.state.session = { ...session, sessionId: "gateway-session-two" };
    if (kind === "trust") h.state.session = { ...session, trustedClientId: "trust-two" };
    if (kind === "client") h.state.session = { ...session, clientId: "client-two" };
    if (kind === "type") h.state.session = { ...session, clientType: "custom" };
    if (kind === "domain") h.state.session = { ...session, metadata: { domainId: "domain-two" } };
    if (kind === "project") h.state.session = { ...session, projectId: "project-two" };
    body.resolve({ projectId: "project-one", flowId: "flow-one" });
    expect((await pending).status).toBe(401);
    expect(h.call).not.toHaveBeenCalled();
  });

  it("refreshes paired role permissions without expanding the paired permission set", async () => {
    const h = authorityHarness();
    const request = h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, readJson: async () => {
      h.state.users = [{ id: "person-one", roleId: "reader", enabled: true }];
      h.state.roles = [{ id: "reader", permissions: ["programs.read", "identity.manage", "data.manage"] }];
      return { projectId: "project-one", flowId: "flow-one" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(200);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ roleId: "reader", permissions: ["programs.read"], channel: "paired-client" }) }));
    expect(h.authorizeToken).toHaveBeenCalledTimes(2);
  });

  it("does not switch a selected bearer to a cookie that becomes valid during the body", async () => {
    const h = authorityHarness();
    h.state.auth = null;
    const request = h.request({ authorization: `Bearer ${TOKEN}`, readJson: async () => {
      h.state.auth = panelAuth("another-cookie-person");
      return { projectId: "project-one", flowId: "flow-one" };
    } });
    expect((await handleProgramRequest(request, h.context)).status).toBe(200);
    expect(h.authority.validateSession).toHaveBeenCalledTimes(1);
    expect(h.call).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.objectContaining({ userId: "person-one", channel: "paired-client" }) }));
    expect(h.present).not.toHaveBeenCalled();
  });

  it.each(["membership", "token", "role", "project"])("rechecks %s after awaited project-domain work", async (kind) => {
    const h = authorityHarness();
    const entered = deferred<void>();
    const domain = deferred<void>();
    h.domain.mockImplementation(() => {
      entered.resolve();
      return domain.promise;
    });
    const pending = handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}` }), h.context);
    await entered.promise;
    if (kind === "membership") h.state.eligible = false;
    if (kind === "token") h.state.session = null;
    if (kind === "role") h.state.roles = [];
    if (kind === "project") h.state.session = { ...h.state.session!, projectId: "project-two" };
    domain.resolve();
    expect((await pending).status).toBe(401);
    expect(h.call).not.toHaveBeenCalled();
  });

  it("checks the final guard after refreshed authentication without another key presentation", async () => {
    const h = authorityHarness();
    h.guard.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await handleProgramRequest(h.request(), h.context)).status).toBe(401);
    expect(h.guard).toHaveBeenCalledTimes(3);
    expect(h.present).toHaveBeenCalledTimes(1);
    expect(h.call).not.toHaveBeenCalled();
  });

  it.each(["initial", "refresh", "final"])("sanitizes %s guard exceptions", async (phase) => {
    const h = authorityHarness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    if (phase !== "initial") h.guard.mockResolvedValueOnce(true);
    if (phase === "final") h.guard.mockResolvedValueOnce(true);
    h.guard.mockRejectedValueOnce(new Error("fixture-private-credential"));
    const request = h.request();
    const response = await handleProgramRequest(request, h.context);
    expect(response.status).toBe(503);
    expect(response.body).not.toContain("fixture-private-credential");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("fixture-private-credential");
    expect(h.call).not.toHaveBeenCalled();
    expect(h.present).toHaveBeenCalledTimes(phase === "initial" ? 0 : 1);
    if (phase === "initial") expect(request.readJson).not.toHaveBeenCalled();
  });

  it("keeps paired endpoint and classification preflight ahead of guard and token lookup", async () => {
    for (const classification of ["missing-name", "destructive"]) {
      const h = authorityHarness();
      h.state.classification = classification;
      const request = h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, endpoint: classification === "missing-name" ? "remove-key" : "get-flow-metadata-detail" });
      expect((await handleProgramRequest(request, h.context)).status).toBe(403);
      expect(h.guard).not.toHaveBeenCalled();
      expect(h.authorizeToken).not.toHaveBeenCalled();
      expect(request.readJson).not.toHaveBeenCalled();
      expect(h.call).not.toHaveBeenCalled();
    }
  });

  it("preserves the local single-pass path when the optional guard is absent", async () => {
    const h = authorityHarness();
    const context = { fluxiq: h.context.fluxiq, identityAuthority: h.authority };
    expect((await handleProgramRequest(h.request(), context)).status).toBe(200);
    expect(h.guard).not.toHaveBeenCalled();
    expect(h.authority.validateSession).toHaveBeenCalledTimes(1);
    expect(h.present).toHaveBeenCalledTimes(1);
  });

  it.each(["run", "epoch", "host"])("retains the original managed %s binding across domain waits", async (kind) => {
    const h = authorityHarness();
    h.state.session = { ...h.state.session!, managedHostId: "host-one" };
    h.state.run = { projectId: "project-one", domainId: "domain-one", runId: "run-one", lease: { resourceKey: "resource-one", epoch: 1 } };
    const entered = deferred<void>();
    const domain = deferred<void>();
    h.domain.mockImplementation(() => {
      entered.resolve();
      return domain.promise;
    });
    const pending = handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, endpoint: "get-recording-capture-policy", readJson: async () => ({ projectId: "project-one" }) }), h.context);
    await entered.promise;
    if (kind === "run") h.state.run = { ...h.state.run, runId: "run-two" };
    if (kind === "epoch") h.state.run = { ...h.state.run, lease: { resourceKey: "resource-one", epoch: 2 } };
    if (kind === "host") h.state.session = { ...h.state.session!, managedHostId: "host-two" };
    domain.resolve();
    expect([401, 403]).toContain((await pending).status);
    expect(h.call).not.toHaveBeenCalled();
  });

  it("refuses a managed epoch changed by the final asynchronous guard", async () => {
    const h = authorityHarness();
    h.state.session = { ...h.state.session!, managedHostId: "host-one" };
    h.state.run = { projectId: "project-one", domainId: "domain-one", runId: "run-one", lease: { resourceKey: "resource-one", epoch: 1 } };
    let checks = 0;
    h.guard.mockImplementation(async () => {
      checks += 1;
      if (checks === 3) h.state.run = { ...h.state.run!, lease: { resourceKey: "resource-one", epoch: 2 } };
      return true;
    });
    const response = await handleProgramRequest(h.request({ sessionId: undefined, authorization: `Bearer ${TOKEN}`, endpoint: "get-recording-capture-policy", readJson: async () => ({ projectId: "project-one" }) }), h.context);
    expect(response.status).toBe(403);
    expect(h.guard).toHaveBeenCalledTimes(3);
    expect(h.call).not.toHaveBeenCalled();
  });
});
