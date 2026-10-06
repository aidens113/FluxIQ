// t267: the re-author a run holds for its judged whole run -- which one is
// still waiting, and how its record is settled. A held edit waits until it is
// marked applied or given a reason; only the latest is the one a re-run runs.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY, automationStudioRefutedResultReauthored } from "../reauthor.ts";
import { automationStudioRefutedResultHeldReauthor, automationStudioRefutedResultReauthorMarked, automationStudioRefutedResultWaitingReauthors } from "../held-reauthor.ts";

const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

function detail(): AutomationStudioFlowRunDetail {
  return { summary: { schemaVersion: "0.1", runId: "run.1", flowId: "flow.catalog", status: "failed", startedAt: 1, updatedAt: 2 }, metadata: {} } as unknown as AutomationStudioFlowRunDetail;
}

const held = (from: AutomationStudioFlowRunDetail, adaptationId: string, attempt: number) => automationStudioRefutedResultReauthored({ detail: from, decision: routed, adaptationId, held: true, attempt });

describe("the re-author a run holds", () => {
  it("names the latest held edit as the one waiting", () => {
    const recorded = held(detail(), "adaptation.held", 1);
    expect(automationStudioRefutedResultHeldReauthor(recorded)).toBe("adaptation.held");
    expect(automationStudioRefutedResultWaitingReauthors(recorded)).toEqual(["adaptation.held"]);
  });

  it("stops naming an edit as waiting once it is settled, applied or not", () => {
    const recorded = held(detail(), "adaptation.held", 1);
    const applied = automationStudioRefutedResultReauthorMarked(recorded, "adaptation.held", { applied: true });
    const refused = automationStudioRefutedResultReauthorMarked(recorded, "adaptation.held", { notAppliedReason: "refuted" });
    expect(applied.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ held: true, applied: true, attempts: [{ adaptationId: "adaptation.held", held: true, applied: true }] });
    expect(refused.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toMatchObject({ held: true, notAppliedReason: "refuted", attempts: [{ notAppliedReason: "refuted" }] });
    for (const settled of [applied, refused]) {
      expect(automationStudioRefutedResultHeldReauthor(settled)).toBeUndefined();
      expect(automationStudioRefutedResultWaitingReauthors(settled)).toEqual([]);
    }
  });

  it("names an earlier held attempt a later one replaced, and marks only the attempt it is given", () => {
    const second = held(held(detail(), "adaptation.first", 1), "adaptation.second", 2);
    expect(automationStudioRefutedResultHeldReauthor(second)).toBe("adaptation.second");
    expect(automationStudioRefutedResultWaitingReauthors(second)).toEqual(["adaptation.first", "adaptation.second"]);
    const superseded = automationStudioRefutedResultReauthorMarked(second, "adaptation.first", { notAppliedReason: "superseded" });
    const marker = superseded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] as { notAppliedReason?: string; attempts: Array<Record<string, unknown>> };
    expect(marker.notAppliedReason).toBeUndefined();
    expect(marker.attempts.map((attempt) => attempt.notAppliedReason)).toEqual(["superseded", undefined]);
  });

  it("names no latest held edit when the latest re-author built nothing, and still the earlier one waiting", () => {
    const failed = automationStudioRefutedResultReauthored({ detail: held(detail(), "adaptation.first", 1), decision: routed, failure: { code: "flow_bootstrap.provider_http_error" }, attempt: 2 });
    expect(automationStudioRefutedResultHeldReauthor(failed)).toBeUndefined();
    expect(automationStudioRefutedResultWaitingReauthors(failed)).toEqual(["adaptation.first"]);
  });

  it("leaves a run with no re-author marker as it is", () => {
    const plain = detail();
    expect(automationStudioRefutedResultReauthorMarked(plain, "adaptation.any", { applied: true })).toBe(plain);
    expect(automationStudioRefutedResultWaitingReauthors(plain)).toEqual([]);
  });
});
