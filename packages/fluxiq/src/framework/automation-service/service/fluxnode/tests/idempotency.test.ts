// @fluxiq-test-group real-sql
// Key ownership survives Core restart, without retaining a verifier of a declared secret.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, parseFluxNodeRunRequest, type FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, RENEW_CARD, runNode } from "../../answer-first/tests/fake-library.ts";
import { fluxNodeLane, OWNER } from "./library-lane.ts";
import type { FluxNodeService } from "../index.ts";
import { FluxNodeRunRegistry } from "../run-registry.ts";
import * as results from "../result-of.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const press = () => runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true });
const script = () => [press(), complete("Saved.")];
const spec = (secret = false) => ({ name: "library.keyed-card", runtime: "library", start: "library://account", goal: "Renew the card, noting {note}.", inputs: { type: "object", properties: { note: { type: "string", ...(secret ? { format: "secret" } : {}) } }, required: ["note"] }, scope: { acts: ["change"] }, options: { judge: "off" } });
function request(body: unknown): FluxNodeRunRequest {
  const parsed = parseFluxNodeRunRequest(body);
  if (!parsed.ok) throw new Error("Invalid test request");
  return parsed.value;
}
async function finish(nodes: FluxNodeService, runId: string): Promise<void> {
  const stream = await nodes.events(OWNER, runId, 0, new AbortController().signal);
  if (!stream.ok) throw new Error(stream.refusal.code);
  for await (const event of stream.value) if (event.type === "check_needed") await nodes.answer(OWNER, runId, { type: "check_answer", eventId: event.eventId, pass: true });
}

describe("a FluxNode idempotency key", () => {
  it("performs owner cleanup if registering the run throws", async () => {
    const lane = await fluxNodeLane(cleanups);
    const body = request({ spec: spec(), inputs: { note: "first note" }, idempotencyKey: "register-throws" });
    const add = vi.spyOn(FluxNodeRunRegistry.prototype, "add").mockImplementationOnce(() => { throw new Error("registration broke"); });
    await expect(lane.fluxNodes.start(OWNER, body)).rejects.toThrow("registration broke");
    expect((await readdir(lane.dataDir, { recursive: true })).filter((file) => file.endsWith(".owner"))).toHaveLength(0);
    add.mockRestore();
    const again = await lane.run(body, { script: script() });
    expect(again.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(1);
  });

  it("performs owner cleanup if finish's fallback result builder rejects", async () => {
    const lane = await fluxNodeLane(cleanups);
    const generating = vi.spyOn(lane.service, "generateFlowBootstrapAdaptation").mockRejectedValueOnce(new Error("generation broke"));
    const fallback = vi.spyOn(results, "fluxNodeResultOf").mockRejectedValueOnce(new Error("fallback broke"));
    const started = await lane.fluxNodes.start(OWNER, request({ spec: spec(), inputs: { note: "first note" }, idempotencyKey: "fallback-throws" }));
    expect(started.ok).toBe(true);
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledOnce());
    await vi.waitFor(async () => expect((await readdir(lane.dataDir, { recursive: true })).filter((file) => file.endsWith(".owner"))).toHaveLength(0));
    generating.mockRestore();
    fallback.mockRestore();
    const again = await lane.run({ name: "library.keyed-card", inputs: { note: "new execution" } }, { script: script() });
    expect(again.result.status).toBe("achieved");
  });

  it("owns its resume execution while another facade retries the original key", async () => {
    const lane = await fluxNodeLane(cleanups);
    const body = request({ spec: { ...spec(), hasCheck: true }, inputs: { note: "first note" }, options: { budgetUsd: 0.001 }, idempotencyKey: "resume-owner" });
    const first = await lane.run(body, { script: [press()] });
    expect(first.result.status).toBe("budget_out");
    await vi.waitFor(async () => expect((await readdir(lane.dataDir, { recursive: true })).filter((file) => file.endsWith(".owner"))).toHaveLength(0));
    const owning = lane.fluxNodes;
    lane.arm({ script: [complete("Saved.")] });
    const resumed = await owning.start(OWNER, request({ resumeHandle: first.result.resumeHandle }));
    if (!resumed.ok) throw new Error(resumed.refusal.code);
    const events = await owning.events(OWNER, resumed.value.runId, 0, new AbortController().signal);
    if (!events.ok) throw new Error(events.refusal.code);
    let checkId: string | undefined;
    for await (const event of events.value) if (event.type === "check_needed") {
      checkId = event.eventId;
      break;
    }
    expect(checkId).toBeDefined();
    const other = lane.restart();
    const retried = await other.start(OWNER, body);
    if (retried.ok) await other.stop(OWNER, retried.value.runId, {});
    await owning.answer(OWNER, resumed.value.runId, { type: "check_answer", eventId: checkId!, pass: true });
    await finish(owning, resumed.value.runId);
    expect(retried).toMatchObject({ ok: false, refusal: { code: "invalid_request" } });
    expect(lane.library.renewals.card).toBe(1);
  });

  it("returns one held execution for concurrent resumes in the same facade", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: spec(), inputs: { note: "first note" }, options: { budgetUsd: 0.001 }, idempotencyKey: "two-resumes" }, { script: [press()] });
    expect(first.result.status).toBe("budget_out");
    lane.arm({ script: [complete("Saved.")] });
    const body = request({ resumeHandle: first.result.resumeHandle });
    const starts = await Promise.all([lane.fluxNodes.start(OWNER, body), lane.fluxNodes.start(OWNER, body)]);
    const ids = starts.map((value) => {
      if (!value.ok) throw new Error(value.refusal.code);
      return value.value.runId;
    });
    await Promise.all([...new Set(ids)].map((id) => finish(lane.fluxNodes, id)));
    expect(ids[1]).toBe(ids[0]);
    expect(lane.library.renewals.card).toBe(1);
  });

  it("still refuses changed non-secret inputs after Core restarts, before any further act", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = request({ spec: spec(), inputs: { note: "first note" }, idempotencyKey: "card-1" });
    await lane.run(first, { script: script() });
    await lane.restartCore();
    const changed = await lane.fluxNodes.start(OWNER, { ...first, inputs: { note: "other note" } });
    if (changed.ok) {
      const stream = await lane.fluxNodes.events(OWNER, changed.value.runId, 0, new AbortController().signal);
      if (stream.ok) for await (const _event of stream.value) { /* consume the incorrectly started run */ }
    }
    expect(changed).toMatchObject({ ok: false, refusal: { code: "idempotency_conflict" } });
    expect(lane.library.renewals.card).toBe(1);
  });

  it("allocates one execution for concurrent starts of the same key", async () => {
    const lane = await fluxNodeLane(cleanups);
    lane.arm({ script: [...script(), ...script()] });
    const body = request({ spec: spec(), inputs: { note: "first note" }, idempotencyKey: "concurrent" });
    const started = await Promise.all([lane.fluxNodes.start(OWNER, body), lane.fluxNodes.start(OWNER, body)]);
    const ids = started.map((value) => {
      if (!value.ok) throw new Error(value.refusal.code);
      return value.value.runId;
    });
    for (const runId of new Set(ids)) {
      const stream = await lane.fluxNodes.events(OWNER, runId, 0, new AbortController().signal);
      if (stream.ok) for await (const _event of stream.value) { /* wait for each started execution */ }
    }
    expect(ids[1]).toBe(ids[0]);
    expect(lane.library.renewals.card).toBe(1);
  });

  it("keeps only binding identity for a declared secret, then rebinds supplied values after restart", async () => {
    const lane = await fluxNodeLane(cleanups);
    const secret = "fixture-credential-low-entropy";
    const body = request({ spec: spec(true), inputs: { note: secret }, idempotencyKey: "secret-binding" });
    const first = await lane.run(body, { script: script() });
    const rawVerifier = createHash("sha256").update(canonicalJson(JSON.parse(JSON.stringify({ key: body.idempotencyKey, request: body })))).digest("hex");
    const files = (await readdir(lane.dataDir, { recursive: true })).filter((entry) => entry.endsWith(".json"));
    for (const file of files) {
      const json = await readFile(path.join(lane.dataDir, file), "utf8");
      expect(json.includes(secret)).toBe(false);
      expect(json.includes(rawVerifier)).toBe(false);
    }
    await lane.restartCore();
    const again = await lane.run({ ...body, inputs: { note: "fixture-credential-rotated" } });
    expect(again.result).toMatchObject({ status: "achieved", flowId: first.result.flowId });
    expect(again.asked).toHaveLength(0);
    expect(lane.library.renewals.card).toBe(1);
  });
});
