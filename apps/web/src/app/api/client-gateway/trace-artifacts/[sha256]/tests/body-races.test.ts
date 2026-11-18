import "./mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";
import { PUT } from "../route";
import { BODY, SHA, closeTraceRuntime, resetTraceRuntime, traceRuntime, uploadRequest, waitForEntry } from "./trace-runtime";

beforeEach(resetTraceRuntime);
afterEach(closeTraceRuntime);

describe("trace upload body authority", () => {
  it.each(["session", "trust", "client", "type", "user", "domain", "project", "recording", "disconnected", "managed", "membership", "account", "workspace", "proof", "iam", "policy-outage", "primary", "abort"])("refuses %s changes during body consumption without intake or lease switching", async change => {
    const entered = deferred();
    const resume = deferred();
    const controller = new AbortController();
    const request = uploadRequest({ signal: controller.signal });
    vi.spyOn(request, "arrayBuffer").mockImplementationOnce(async () => {
      entered.resolve();
      await resume.promise;
      return BODY.buffer;
    });
    const pending = PUT(request, { params: Promise.resolve({ sha256: SHA }) });
    await waitForEntry(entered.promise, pending);
    expect(runtime.releases.a).not.toHaveBeenCalled();
    const session = traceRuntime.sessions.get("a")!;
    if (change === "session") session.sessionId = "changed-session";
    if (change === "trust") session.trustedClientId = "changed-trust";
    if (change === "client") session.clientId = "changed-client";
    if (change === "type") session.clientType = "cli";
    if (change === "user") session.operatorUserId = "person-b";
    if (change === "domain") session.metadata = { domainId: "domain-b" };
    if (change === "project") session.projectId = "changed-project";
    if (change === "recording") session.activeRecordingId = "changed-recording";
    if (change === "disconnected") session.disconnectedAt = 3;
    if (change === "managed") session.managedHostId = "managed";
    if (change === "membership") runtime.memberships.set("person-a", []);
    if (change === "account") runtime.accounts.set("person-a", { status: "disabled", deletion: null });
    if (change === "workspace") runtime.workspaces.delete("tenant-a");
    if (change === "proof") traceRuntime.proofCurrent.set("a", false);
    if (change === "iam") runtime.policies.set("tenant-a", "none");
    if (change === "policy-outage") runtime.policyError = true;
    if (change === "primary") traceRuntime.primaryCurrent = false;
    if (change === "abort") controller.abort();
    expect(runtime.releases.a).not.toHaveBeenCalled();
    resume.resolve();
    const response = await pending;
    expect(response.status).toBe(change === "policy-outage" ? 503 : 403);
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(traceRuntime.intakes.get("b")).not.toHaveBeenCalled();
    expect(traceRuntime.intakes.get("primary")).not.toHaveBeenCalled();
    expect(runtime.resolveBrowser).toHaveBeenCalledOnce();
    expect(runtime.manager.acquire).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("holds the proved lease through awaited params and revalidates the original target afterward", async () => {
    const entered = deferred();
    const params = deferred<{ sha256: string }>();
    const context = { get params() {
      entered.resolve();
      return params.promise;
    } };
    const pending = PUT(uploadRequest(), context);
    await waitForEntry(entered.promise, pending);
    expect(runtime.releases.a).not.toHaveBeenCalled();
    traceRuntime.sessions.get("a")!.trustedClientId = "changed-after-params";
    params.resolve({ sha256: SHA });
    const response = await pending;
    expect(response.status).toBe(401);
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("releases after a rejected aborted body without reporting an intake", async () => {
    const controller = new AbortController();
    const request = uploadRequest({ signal: controller.signal });
    vi.spyOn(request, "arrayBuffer").mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("private aborted body bytes");
    });
    const response = await PUT(request, { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("private");
    expect(traceRuntime.intakes.get("a")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
