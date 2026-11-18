import "./mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";
import { PUT } from "../route";
import { SHA, closeTraceRuntime, resetTraceRuntime, traceRuntime, uploadRequest } from "./trace-runtime";

beforeEach(resetTraceRuntime);
afterEach(closeTraceRuntime);

describe("synchronous final trace intake binding", () => {
  it.each(["session", "trust-id", "trust-user", "trust-client", "trust-domain", "revoked", "expired", "project", "recording", "domain", "primary", "abort"])("refuses %s changes after the actual asynchronous authorization returned true", async change => {
    const controller = new AbortController();
    traceRuntime.afterAuthorization = () => {
      const session = traceRuntime.sessions.get("a")!;
      const trust = traceRuntime.views.get("a")!.trustedClients[0]!;
      if (change === "session") session.sessionId = "changed-session";
      if (change === "trust-id") trust.trustedClientId = "changed-trust";
      if (change === "trust-user") trust.approvedByUserId = "person-b";
      if (change === "trust-client") trust.clientId = "changed-client";
      if (change === "trust-domain") trust.domainId = "domain-b";
      if (change === "revoked") trust.status = "revoked";
      if (change === "expired") trust.status = "expired";
      if (change === "project") session.projectId = "changed-project";
      if (change === "recording") session.activeRecordingId = "changed-recording";
      if (change === "domain") session.metadata = { domainId: "domain-b" };
      if (change === "primary") traceRuntime.primaryCurrent = false;
      if (change === "abort") controller.abort();
    };
    const response = await PUT(uploadRequest({ signal: controller.signal }), { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "The upload's authorization is no longer current." });
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(traceRuntime.intakes.get("b")).not.toHaveBeenCalled();
    expect(traceRuntime.intakes.get("primary")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("preserves the helper's sanitized503 if the synchronous live view throws", async () => {
    traceRuntime.afterAuthorization = () => {
      vi.mocked(traceRuntime.gateways.get("a")!.snapshot).mockImplementationOnce(() => { throw new Error("private trace view credential-value"); });
    };
    const response = await PUT(uploadRequest(), { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Trace artifact authorization could not be verified." });
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
