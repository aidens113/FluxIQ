import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import { openTrace, pairClient, traceScope } from "../../../client-gateway/tests/trace-tap-support.ts";
import type { FluxIQ } from "../../../framework/index.ts";
import { uploadTraceArtifact } from "../trace-artifact-upload.ts";

type Upload = Parameters<typeof uploadTraceArtifact>[0];
const BYTES = new TextEncoder().encode("<!doctype html><p>trace upload fixture</p>");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const gateways: ClientGatewayService[] = [];

afterEach(async () => {
  await Promise.all(gateways.splice(0).map(gateway => gateway.close()));
});

function fixture(gateway = new ClientGatewayService()) {
  gateways.push(gateway);
  const order: string[] = [];
  const receive = gateway.receiveTraceArtifact.bind(gateway);
  const intake = vi.spyOn(gateway, "receiveTraceArtifact").mockImplementation((...args) => {
    order.push("intake");
    return receive(...args);
  });
  const body = vi.fn(async () => {
    order.push("body");
    return BYTES.buffer;
  });
  const stillAuthorized = vi.fn(async () => {
    order.push("authorization");
    return true;
  });
  // The helper reads only this real gateway; there is no proxy or replacement intake engine.
  const fluxiq = { programs: { clientGateway: gateway } } as unknown as FluxIQ;
  const input: Upload = { fluxiq, request: { headers: new Headers({ "content-type": "text/html; charset=utf-8" }), arrayBuffer: body }, sha256: SHA, sessionId: "session-upload", stillAuthorized };
  return { input, order, intake, body, stillAuthorized };
}

describe("trace upload synchronous intake guard", () => {
  it("preserves callers without the hook and the original digest/media/zero-trace result", async () => {
    const f = fixture();
    f.input.sha256 = SHA.toUpperCase();
    const response = await uploadTraceArtifact(f.input);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, payload: { sha256: SHA, traces: 0 } });
    expect(f.order).toEqual(["body", "authorization", "intake"]);
    expect(f.intake).toHaveBeenCalledWith("session-upload", { sha256: SHA, mediaType: "text/html", bytes: BYTES });
  });

  it("calls a true synchronous hook exactly once after authorization and immediately before actual intake", async () => {
    const f = fixture();
    const before = vi.fn(() => {
      f.order.push("before-intake");
      return true;
    });
    f.input.beforeIntake = before;
    expect((await uploadTraceArtifact(f.input)).status).toBe(200);
    expect(before).toHaveBeenCalledOnce();
    expect(f.order).toEqual(["body", "authorization", "before-intake", "intake"]);
  });

  it("keeps a false hook's existing stale-upload 403 without intake", async () => {
    const f = fixture();
    f.input.beforeIntake = () => false;
    const response = await uploadTraceArtifact(f.input);
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: "The upload's authorization is no longer current." });
    expect(f.intake).not.toHaveBeenCalled();
  });

  it("returns a fixed unavailable 503 for a throwing hook without its raw cause", async () => {
    const f = fixture();
    f.input.beforeIntake = () => { throw new Error("private-provider-path secret-value"); };
    const response = await uploadTraceArtifact(f.input);
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: "Trace artifact authorization could not be verified." });
    expect(response.body).not.toContain("secret-value");
    expect(f.intake).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 0, 1, "true", {}, Promise.resolve(true)])("does not admit an untyped nonboolean hook result %j", async value => {
    const f = fixture();
    Object.assign(f.input, { beforeIntake: () => value });
    expect((await uploadTraceArtifact(f.input)).status).toBe(403);
    expect(f.intake).not.toHaveBeenCalled();
  });

  it("does not invoke the hook after failed asynchronous authorization", async () => {
    const f = fixture();
    f.stillAuthorized.mockResolvedValueOnce(false);
    const before = vi.fn(() => true);
    f.input.beforeIntake = before;
    expect((await uploadTraceArtifact(f.input)).status).toBe(403);
    expect(before).not.toHaveBeenCalled();
    expect(f.intake).not.toHaveBeenCalled();
  });

  it("catches currentness lost in the authorization await continuation gap", async () => {
    const f = fixture();
    let current = true;
    f.stillAuthorized.mockImplementationOnce(async () => {
      queueMicrotask(() => { current = false; });
      return true;
    });
    f.input.beforeIntake = () => current;
    expect((await uploadTraceArtifact(f.input)).status).toBe(403);
    expect(f.intake).not.toHaveBeenCalled();
  });

  it("does not insert an await between a successful hook and intake", async () => {
    const f = fixture();
    f.input.beforeIntake = () => {
      f.order.push("before-intake");
      queueMicrotask(() => { f.order.push("after-turn"); });
      return true;
    };
    expect((await uploadTraceArtifact(f.input)).status).toBe(200);
    expect(f.order).toEqual(["body", "authorization", "before-intake", "intake", "after-turn"]);
  });

  it.each(["digest", "media", "empty", "declared-size", "actual-size"])("preserves the original %s validator before either authority hook or intake", async kind => {
    const f = fixture();
    const before = vi.fn(() => true);
    f.input.beforeIntake = before;
    if (kind === "digest") f.input.sha256 = "invalid";
    if (kind === "media") f.input.request.headers.set("content-type", "application/javascript");
    if (kind === "empty") f.body.mockResolvedValueOnce(new ArrayBuffer(0));
    if (kind === "declared-size") f.input.request.headers.set("content-length", String(20 * 1024 * 1024 + 1));
    if (kind === "actual-size") f.body.mockResolvedValueOnce(new ArrayBuffer(20 * 1024 * 1024 + 1));
    const response = await uploadTraceArtifact(f.input);
    expect(response.status).toBe(kind === "media" ? 415 : kind.endsWith("size") ? 413 : 400);
    expect(f.stillAuthorized).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
    expect(f.intake).not.toHaveBeenCalled();
  });

  it("leaves digest mismatch to the real Core trace intake", async () => {
    const f = fixture();
    f.input.sha256 = "c".repeat(64);
    f.input.beforeIntake = () => true;
    const response = await uploadTraceArtifact(f.input);
    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: "Trace artifact digest does not match its bytes." });
    expect(f.intake).toHaveBeenCalledOnce();
  });

  it("takes actual artifact bytes into two real in-memory trace claimants", async () => {
    const scope = traceScope();
    const first = openTrace("trace.upload.one");
    const second = openTrace("trace.upload.two");
    const gateway = new ClientGatewayService({ trace: scope.source });
    const f = fixture(gateway);
    const client = await pairClient(gateway, "client.upload");
    await scope.within(first.recorder, () => gateway.captureSnapshot(client.sessionId));
    await scope.within(second.recorder, () => gateway.captureSnapshot(client.sessionId));
    f.input.sessionId = client.sessionId;
    f.input.stillAuthorized = async () => (await gateway.authorizeToken(client.token))?.sessionId === client.sessionId;
    f.input.beforeIntake = () => true;
    const response = await uploadTraceArtifact(f.input);
    expect(JSON.parse(response.body)).toEqual({ ok: true, payload: { sha256: SHA, traces: 2 } });
    await first.recorder.flush();
    await second.recorder.flush();
    for (const trace of [first, second]) {
      const artifacts = await trace.store.listArtifacts(trace.traceId);
      expect(artifacts).toEqual([expect.objectContaining({ sha256: SHA, byteLength: BYTES.byteLength })]);
      expect(await trace.store.readArtifact(trace.traceId, artifacts[0]!.id)).toEqual(BYTES);
    }
  });

  it("does not hide unrelated authorization or intake exceptions in the hook catch", async () => {
    const f = fixture();
    const failure = new Error("fixture intake failed");
    f.stillAuthorized.mockRejectedValueOnce(failure);
    await expect(uploadTraceArtifact(f.input)).rejects.toBe(failure);
    f.intake.mockImplementationOnce(() => { throw failure; });
    await expect(uploadTraceArtifact(f.input)).rejects.toBe(failure);
  });
});
