import { describe, expect, it } from "vitest";
import type { ActivityPage } from "../../../../../features/security/activity/model";
import { readActivity } from "../read-activity";
import { auditHarness, memoryAudit, record, userFrn, WORKSPACE } from "./audit-harness";

const payload = (answer: { body: unknown }) => (answer.body as { payload: ActivityPage }).payload;
const ana = userFrn(WORKSPACE, "ana");
const SAVE = "secret-keys:SetModelKey";

const decision = (time: number, requestId: string, action = SAVE) => record({ time, principal: ana, requestId, action });
const outcome = (time: number, requestId: string, result: "succeeded" | { errorKind: string }, action = SAVE) =>
  record({ time, principal: ana, requestId, action, outcome: result === "succeeded" ? { result } : { result: "failed", errorKind: result.errorKind } });

describe("readActivity: a key write's outcome joins its decision entry", () => {
  it("shows a failed save as one failed entry with its error kind, and a succeeded one as one succeeded entry", async () => {
    const audit = memoryAudit([decision(10, "r1"), outcome(10, "r1", { errorKind: "key_rejected" }), decision(20, "r2"), outcome(20, "r2", "succeeded")]);
    const answer = await readActivity(auditHarness({ audit, names: { ana: "Ana" } }).deps, null);
    expect(payload(answer).entries).toEqual([
      { at: 20000, who: "Ana", action: SAVE, outcome: "allowed", resources: [], result: "succeeded" },
      { at: 10000, who: "Ana", action: SAVE, outcome: "allowed", resources: [], result: "failed", errorKind: "key_rejected" }
    ]);
  });

  it("leaves an endpoint without an outcome row unchanged", async () => {
    const answer = await readActivity(auditHarness({ audit: memoryAudit([decision(10, "r1", "studio:ListProjects")]), names: { ana: "Ana" } }).deps, null);
    expect(payload(answer).entries).toEqual([{ at: 10000, who: "Ana", action: "studio:ListProjects", outcome: "allowed", resources: [] }]);
  });

  it("sends no request id", async () => {
    const audit = memoryAudit([decision(10, "req-secret-1"), outcome(11, "req-secret-1", "succeeded")]);
    const text = JSON.stringify((await readActivity(auditHarness({ audit }).deps, null)).body);
    expect(text).not.toContain("req-secret-1");
    expect(text).not.toContain("requestId");
  });

  it("joins by request id and action, not by neighbours", async () => {
    const audit = memoryAudit([decision(10, "r1"), decision(10, "r2"), outcome(11, "r1", { errorKind: "boom" }), outcome(11, "r2", "succeeded")]);
    const entries = payload(await readActivity(auditHarness({ audit }).deps, null)).entries;
    expect(entries.map((e) => [(e as { result?: string }).result, (e as { errorKind?: string }).errorKind])).toEqual([["succeeded", undefined], ["failed", "boom"]]);
  });

  it("never splits a pair across a full page: reads on until the decision row arrives", async () => {
    // Newest first: 49 plain rows, then the outcome, a 50th plain row that fills the page, then the decision.
    const rows = [decision(1, "slow"), ...Array.from({ length: 50 }, (_, i) => decision(100 + i, `p${i}`, "studio:ListProjects"))];
    rows.splice(25, 0, outcome(500, "slow", { errorKind: "late" }));
    const audit = memoryAudit([...rows]);
    const page = payload(await readActivity(auditHarness({ audit }).deps, null));
    const failed = page.entries.filter((e) => (e as { result?: string }).result === "failed");
    expect(failed).toHaveLength(1);
    expect((failed[0] as { errorKind?: string }).errorKind).toBe("late");
    expect(page.entries.every((e) => e.action === "studio:ListProjects" || (e as { result?: string }).result !== undefined)).toBe(true);
  });

  it("does not send an outcome whose decision row is gone", async () => {
    const page = payload(await readActivity(auditHarness({ audit: memoryAudit([outcome(10, "lost", "succeeded")]) }).deps, null));
    expect(page.entries).toEqual([]);
  });
});
