import "./mocks";
import { ClientGatewayService } from "fluxiq/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";
import { PUT } from "../route";
import { realTrace } from "./real-trace";
import { BODY, SHA, closeTraceRuntime, resetTraceRuntime, traceRuntime, uploadRequest } from "./trace-runtime";

beforeEach(resetTraceRuntime);
afterEach(closeTraceRuntime);

describe("actual Core gateway trace intake through selected route", () => {
  it("records actual bytes in separate tenant stores with colliding trace/client/project/recording ids", async () => {
    const a = await realTrace("a");
    const b = await realTrace("b");
    const first = await PUT(uploadRequest({ token: a.token }), { params: Promise.resolve({ sha256: SHA }) });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 1 } });
    await a.recorder.flush();
    await b.recorder.flush();
    expect(await b.store.listArtifacts(b.traceId)).toEqual([]);
    expect(traceRuntime.intakes.get("b")).not.toHaveBeenCalled();
    const second = await PUT(uploadRequest({ token: b.token, query: "?domainId=domain-b" }), { params: Promise.resolve({ sha256: SHA }) });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 1 } });
    await b.recorder.flush();
    for (const trace of [a, b]) {
      const artifacts = await trace.store.listArtifacts(trace.traceId);
      expect(artifacts).toEqual([expect.objectContaining({ sha256: SHA, byteLength: BODY.byteLength })]);
      expect(await trace.store.readArtifact(trace.traceId, artifacts[0]!.id)).toEqual(BODY);
    }
    expect(traceRuntime.intakes.get("primary")).not.toHaveBeenCalled();
    expect(runtime.releases.a).toHaveBeenCalledOnce();
    expect(runtime.releases.b).toHaveBeenCalledOnce();
  });

  it("retains zero-trace success when the requesting trace closes normally before intake", async () => {
    const trace = await realTrace("a");
    await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
    const response = await PUT(uploadRequest({ token: trace.token }), { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });

  it("refuses a late response honestly without rolling back an artifact already taken by the trace", async () => {
    const trace = await realTrace("a");
    const receive = ClientGatewayService.prototype.receiveTraceArtifact.bind(trace.gateway);
    traceRuntime.intakes.get("a")!.mockImplementationOnce((sessionId, artifact) => {
      const intake = receive(sessionId, artifact);
      traceRuntime.proofCurrent.set("a", false);
      return intake;
    });
    const response = await PUT(uploadRequest({ token: trace.token }), { params: Promise.resolve({ sha256: SHA }) });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(SHA);
    await trace.recorder.flush();
    const artifacts = await trace.store.listArtifacts(trace.traceId);
    expect(artifacts).toHaveLength(1);
    expect(await trace.store.readArtifact(trace.traceId, artifacts[0]!.id)).toEqual(BODY);
    expect(runtime.releases.a).toHaveBeenCalledOnce();
  });
});
