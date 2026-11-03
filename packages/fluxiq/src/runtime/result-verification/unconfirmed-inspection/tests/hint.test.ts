import { describe, expect, it } from "vitest";
import { automationStudioResultVerificationFailsRun } from "../../contracts/index.ts";
import { automationStudioResultUnconfirmedInspection } from "../index.ts";
import { inspectionFixture } from "./fixture.ts";

const scope = { round: 1, flowSignature: "tested-flow", replaySignature: "tested-replay" };

describe("unconfirmed inspection hint provenance", () => {
  it("keeps only unmeasured structured allegations after re-prompt, without restoring unsupported advice", async () => {
    const summary = inspectionFixture.summary();
    let forwarded: unknown;
    const report = await automationStudioResultUnconfirmedInspection.during(scope, async () => {
      const report = await inspectionFixture.report(summary);
      if (report.outcome.performed) {
        forwarded = automationStudioResultUnconfirmedInspection.forSummary(report.outcome.unconfirmedInspection, summary);
        expect(automationStudioResultUnconfirmedInspection.forSummary(report.outcome.unconfirmedInspection, structuredClone(summary))).toBeUndefined();
      }
      return report;
    });
    if (!report.outcome.performed) throw new Error("not checked");
    const hint = report.outcome.unconfirmedInspection;
    expect(report.outcome).toMatchObject({ verdict: "unsure", basis: "model_unconfirmed", calls: 4, unsupportedNo: { reasked: true, calls: [1, 2] } });
    expect(hint).toMatchObject({ status: "unconfirmed", requiresFreshRead: true, reason: "row_cell_unmeasured", claims: [{ call: 1 }, { call: 2 }] });
    expect(report.outcome.unconfirmedReading?.advice).toBeUndefined();
    expect(JSON.stringify(report.outcome)).not.toContain("Remove the status condition without checking it.");
    expect(automationStudioResultVerificationFailsRun(report.outcome)).toBe(false);
    expect(forwarded).toBe(hint);
    expect(automationStudioResultUnconfirmedInspection.forSummary(hint, summary)).toBeUndefined();
    expect(automationStudioResultUnconfirmedInspection.forRound(hint, scope)).toBe(hint);
  });

  it("rejects forged copies, another summary, stale rounds/Flows and changed evidence", async () => {
    const summary = inspectionFixture.summary();
    const report = await automationStudioResultUnconfirmedInspection.during(scope, () => inspectionFixture.report(summary));
    if (!report.outcome.performed) throw new Error("not checked");
    const hint = report.outcome.unconfirmedInspection;
    expect(automationStudioResultUnconfirmedInspection.forRound(structuredClone(hint), scope)).toBeUndefined();
    expect(automationStudioResultUnconfirmedInspection.forSummary(hint, structuredClone(summary))).toBeUndefined();
    expect(automationStudioResultUnconfirmedInspection.forRound(hint, { ...scope, round: 2 })).toBeUndefined();
    expect(automationStudioResultUnconfirmedInspection.forRound(hint, { ...scope, flowSignature: "changed-flow" })).toBeUndefined();
    expect(automationStudioResultUnconfirmedInspection.forRound(hint, { ...scope, replaySignature: "changed-replay" })).toBeUndefined();
    summary.totalRecordCount += 1;
    expect(automationStudioResultUnconfirmedInspection.forSummary(hint, summary)).toBeUndefined();
  });

  it("issues no hint outside a current build judge or for a measured/refuted/empty defect", async () => {
    const unscoped = await inspectionFixture.report(inspectionFixture.summary());
    expect(unscoped.outcome).not.toHaveProperty("unconfirmedInspection");
    for (const summary of [inspectionFixture.summary("Open"), inspectionFixture.summary("Closed")]) {
      const report = await automationStudioResultUnconfirmedInspection.during(scope, () => inspectionFixture.report(summary));
      expect(report.outcome).not.toHaveProperty("unconfirmedInspection");
    }
    const empty = await automationStudioResultUnconfirmedInspection.during(scope, () => inspectionFixture.report(inspectionFixture.summary(), []));
    expect(empty.outcome).not.toHaveProperty("unconfirmedInspection");
  });
});
