import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectAuthorityGuardStore as Store, type AuthorityGuardLegacyRequest } from "../index.ts";

const digest = (letter = "a") => `sha256:${letter.repeat(64)}`;
const request = (operationKey = "original-operation", expectedRevision = 0): AuthorityGuardLegacyRequest => ({ protocolVersion: 1, projectId: "original-project", ownerKind: "flow", ownerId: "original-flow", operationKind: "flow.save", requestDigest: digest(), expectedRevision, operationKey });
const capture = (captureKey = "original-capture", expectedRevision = 0) => ({ protocolVersion: 1 as const, projectId: "original-project", ownerKind: "capture", ownerId: "read-only-owner", requestDigest: digest(), expectedRevision, captureKey });
async function fixture(run: (store: Store, pool: AutomationStudioProjectDatabasePool, root: string) => Promise<void>, release = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "authority-guard-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
  const store = await Store.open({ pool, projectId: "original-project", ...(release ? { captureReleaseOwner: { protocolVersion: 1 as const, ownerKind: "capture", ownerId: "read-only-owner", verifyReadOnlyRelease: async () => ({ evidenceDigest: digest("b") }) } } : {}) });
  try { await run(store, pool, root); } finally { await store.close(); await pool.closeAll(); const resolved = path.resolve(root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("authority-guard-")) throw new Error("Unsafe fixture cleanup"); await rm(resolved, { recursive: true, force: true }); }
}
describe("original project authority guard", () => {
  it("commits pending before callback, completes once and never replays external result", async () => fixture(async (store, _pool, root) => {
    expect(await store.readState()).toBeNull(); let count = 0;
    const first = await store.runLegacyMutation(request(), async () => { expect((await store.reconcileLegacy(request()))?.state).toBe("pending"); count++; await writeFile(path.join(root, "sentinel"), "private-result"); return { value: "private-result", resultDigest: digest("b") }; });
    expect(first.status).toBe("completed"); expect((await store.readState())?.completedRevision).toBe(1);
    expect((await store.runLegacyMutation(request(), async () => { count++; throw new Error("replay"); })).status).toBe("result_unavailable"); expect(count).toBe(1); expect(await readFile(path.join(root, "sentinel"), "utf8")).toBe("private-result");
  }));
  it("pending/unknown blocks capture and failure never releases claim", async () => fixture(async store => {
    await expect(store.runLegacyMutation(request(), async () => { throw new Error("partial external effect"); })).rejects.toThrow("partial external effect");
    expect((await store.reconcileLegacy(request()))?.state).toBe("unknown"); await expect(store.beginCapture(capture())).rejects.toThrow();
    expect((await store.runLegacyMutation(request(), async () => ({ value: null, resultDigest: digest() }))).status).toBe("outcome_unknown");
  }));
  it("capture releases through recorded owner and old release cannot clear newer capture", async () => fixture(async store => {
    const first = await store.beginCapture(capture()); expect(first.acquired).toBe(true);
    await expect(store.claimLegacy(request())).rejects.toThrow();
    const identity = { captureKey: "original-capture", ownerKind: "capture", ownerId: "read-only-owner", requestDigest: digest(), captureDigest: first.record.captureDigest };
    await store.releaseCapture(identity); expect((await store.beginCapture(capture())).acquired).toBe(false);
    await store.beginCapture(capture("second-capture")); await store.releaseCapture(identity); expect((await store.readState())?.activeCaptureKey).toBe("second-capture");
  }));
  it("requires trusted release owner", async () => fixture(async store => {
    const found = await store.beginCapture(capture()); await expect(store.releaseCapture({ captureKey: "original-capture", ownerKind: "capture", ownerId: "read-only-owner", requestDigest: digest(), captureDigest: found.record.captureDigest })).rejects.toThrow(); expect((await store.readState())?.mode).toBe("capturing");
  }, false));
  it("separate SQL owners issue one callback permission and serialize legacy versus capture", async () => fixture(async (store, _pool, root) => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root }), other = await Store.open({ pool, projectId: "original-project" });
    try { const claims = await Promise.all([store.claimLegacy(request()), other.claimLegacy(request())]); expect(claims.filter(x => x.executionAllowed)).toHaveLength(1); await expect(other.beginCapture(capture())).rejects.toThrow(); await expect(other.claimLegacy(request("different-key"))).rejects.toThrow(); }
    finally { await other.close(); await pool.closeAll(); }
  }));
  it("capture and legacy admission race admits one owner", async () => fixture(async (store, _pool, root) => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root }), other = await Store.open({ pool, projectId: "original-project" });
    try { const outcomes = await Promise.allSettled([store.claimLegacy(request()), other.beginCapture(capture())]); expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1); }
    finally { await other.close(); await pool.closeAll(); }
  }));
  it("immutable historical receipt survives newer head and stale revisions refuse", async () => fixture(async store => {
    await store.runLegacyMutation(request(), async () => ({ value: 1, resultDigest: digest("b") }));
    await store.runLegacyMutation(request("next-operation", 1), async () => ({ value: 2, resultDigest: digest("c") }));
    expect((await store.reconcileLegacy(request()))?.completion?.completedRevision).toBe(1); expect((await store.readState())?.completedRevision).toBe(2);
    await expect(store.beginCapture(capture())).rejects.toThrow(); await expect(store.claimLegacy(request("third-operation", 0))).rejects.toThrow();
  }));
  it("freezes request before awaiting and refuses forged completion ownership", async () => fixture(async store => {
    const input = request(), pending = store.claimLegacy(input); input.ownerId = "changed-owner";
    const claim = await pending; expect(claim.record.request.ownerId).toBe("original-flow");
    await expect(store.completeLegacy({} as never, { resultDigest: digest() })).rejects.toThrow();
    await expect(store.claimLegacy(input)).rejects.toThrow();
  }));
  it("validates completion result input before asynchronous effects", async () => fixture(async store => {
    const claim = await store.claimLegacy(request()); if (!claim.executionAllowed) throw new Error("fixture");
    await expect(store.completeLegacy(claim.capability, { resultDigest: digest(), extra: true } as never)).rejects.toThrow();
    const input = { resultDigest: digest("b") }; const pending = store.completeLegacy(claim.capability, input); input.resultDigest = digest("c");
    expect((await pending).resultDigest).toBe(digest("b"));
  }));
  it("committed whole-operation receipt wins a racing unknown transition", async () => fixture(async store => {
    const claim = await store.claimLegacy(request()); if (!claim.executionAllowed) throw new Error("fixture");
    await Promise.all([store.completeLegacy(claim.capability, { resultDigest: digest("b") }), store.markLegacyUnknown(claim.capability, "owner_interrupted")]);
    expect((await store.reconcileLegacy(request()))?.state).toBe("completed"); expect((await store.readState())?.completedRevision).toBe(1);
  }));
  it("does not persist an opaque live result or producer payload", async () => fixture(async (store, pool) => {
    await store.runLegacyMutation(request(), async () => ({ value: { privatePage: "secret-sentinel" }, resultDigest: digest("b") }));
    const lease = await pool.acquire("original-project"); try { expect(JSON.stringify(await lease.database.all("select * from mutation_records"))).not.toContain("secret-sentinel"); expect(JSON.stringify(await lease.database.all("select * from authority_guard_legacy"))).not.toContain("secret-sentinel"); } finally { await lease.release(); }
  }));

  it("late unknown cannot leave a borrowed completion proof under unknown mutation key", async () => fixture(async store => {
    const claim = await store.claimLegacy(request()); if (!claim.executionAllowed) throw new Error("fixture");
    const unit = Reflect.get(store, "unit") as import("../../unit-of-work.ts").AutomationStudioProjectUnitOfWork;
    const original = unit.runIdempotent.bind(unit); let reached!: () => void, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { reached = resolve; });
    const spy = vi.spyOn(unit, "runIdempotent").mockImplementation(async (input, operation) => { if (input.operationKind === "authority_guard.legacy.unknown") { reached(); await gate; } return original(input, operation); });
    try { const pending = store.markLegacyUnknown(claim.capability, "owner_interrupted"); await waiting; await store.completeLegacy(claim.capability, { resultDigest: digest("b") }); release(); await pending; expect((await store.reconcileLegacy(request()))?.state).toBe("completed"); }
    finally { release(); spy.mockRestore(); }
  }));
  it("claim rollback gives zero external effects", async () => fixture(async (store, pool) => {
    const lease = await pool.acquire("original-project"); try { await lease.database.run("create trigger guard_claim_abort before insert on authority_guard_legacy begin select raise(abort,'claim_probe_failure'); end"); } finally { await lease.release(); }
    let effects = 0; await expect(store.runLegacyMutation(request(), async () => { effects++; return { value: null, resultDigest: digest() }; })).rejects.toThrow(); expect(effects).toBe(0); expect(await store.readState()).toBeNull();
  }));

  it("reconciles actual completion COMMIT followed by lost acknowledgement without second callback", async () => fixture(async store => {
    const unit = Reflect.get(store, "unit") as import("../../unit-of-work.ts").AutomationStudioProjectUnitOfWork, original = unit.runIdempotent.bind(unit);
    const spy = vi.spyOn(unit, "runIdempotent").mockImplementation(async (input, operation) => { const result = await original(input, operation); if (input.operationKind === "authority_guard.legacy.complete") throw new Error("lost acknowledgement after COMMIT"); return result; });
    let effects = 0; try { expect((await store.runLegacyMutation(request(), async () => { effects++; return { value: null, resultDigest: digest("b") }; })).status).toBe("completed"); }
    finally { spy.mockRestore(); }
    expect((await store.runLegacyMutation(request(), async () => { effects++; return { value: null, resultDigest: digest("b") }; })).status).toBe("result_unavailable"); expect(effects).toBe(1); expect((await store.readState())?.completedRevision).toBe(1);
  }));
  it("caller no-effects assertion cannot release and unknown capture remains fenced", async () => fixture(async store => {
    const found = await store.beginCapture(capture()), identity = { captureKey: "original-capture", ownerKind: "capture", ownerId: "read-only-owner", requestDigest: digest(), captureDigest: found.record.captureDigest };
    await store.markCaptureUnknown(identity, "owner_interrupted"); expect((await store.reconcileCapture(capture()))?.state).toBe("unknown");
    await expect(store.releaseCapture({ ...identity, noEffects: true } as never)).rejects.toThrow(); expect((await store.readState())?.mode).toBe("capturing");
    await store.releaseCapture(identity); expect((await store.readState())?.mode).toBe("legacy");
  }));

});
