// Whether the patch ladder follows a refuted result (C4 and C5 of run 38,
// `run-muqilf9s-c3211328`): never for a refutation that names no step, never
// once the re-author explored with the fix in hand, and always otherwise.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { automationStudioRefutedResultLadderSkipped } from "../ladder-skip.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY, AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE, automationStudioRefutedResultReauthored } from "../reauthor.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY } from "../history.ts";

const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

function run(): AutomationStudioFlowRunDetail {
  return {
    summary: { schemaVersion: "0.1", runId: "run.1", flowId: "flow.catalog", status: "failed", startedAt: 1, updatedAt: 2 },
    metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, nodeId: "node.extract", code: AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE } }
  } as unknown as AutomationStudioFlowRunDetail;
}

/** A re-author build of repair `attempt` that failed, having made `decisions` decisions (absent: it did not say). */
function built(detail: AutomationStudioFlowRunDetail, attempt: number, decisions: number | undefined, code = "flow_bootstrap.not_doable"): AutomationStudioFlowRunDetail {
  return automationStudioRefutedResultReauthored({ detail, decision: routed, attempt, failure: { code, ...(decisions === undefined ? {} : { evidenceLoop: { decisionCount: decisions } }) } });
}

function marker(detail: AutomationStudioFlowRunDetail | undefined): Record<string, unknown> | undefined {
  return detail?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] as Record<string, unknown> | undefined;
}

describe("whether the patch ladder follows a refuted result", () => {
  it("does not when the refutation names no step, whatever the re-author did", () => {
    const skipped = automationStudioRefutedResultLadderSkipped({ detail: built(run(), 1, 0, "flow_bootstrap.request_refused_evidence_denied_key"), namesStep: false, attempt: 1, afterCode: "flow_bootstrap.request_refused_evidence_denied_key" });

    expect(marker(skipped)).toMatchObject({ routed: true, ladderSkipped: { reason: "names_no_step", afterCode: "flow_bootstrap.request_refused_evidence_denied_key" } });
  });

  it("does not once a build of this repair explored, keeping what the re-author recorded", () => {
    // The first build explored; the retry was refused by the purse before any decision.
    const retried = built(built(run(), 1, 8), 1, undefined, "llm_budget.run_cost_limit");
    const skipped = automationStudioRefutedResultLadderSkipped({ detail: retried, namesStep: true, attempt: 1, afterCode: "llm_budget.run_cost_limit" });

    expect(marker(skipped)).toMatchObject({
      routed: true, code: "llm_budget.run_cost_limit", attempts: [{ attempt: 1, evidenceLoop: { decisionCount: 8 } }, { attempt: 1 }],
      ladderSkipped: { reason: "structural_fix", afterCode: "llm_budget.run_cost_limit" }
    });
  });

  it("does when the re-author ended before its first decision, or never said", () => {
    expect(automationStudioRefutedResultLadderSkipped({ detail: built(run(), 1, 0), namesStep: true, attempt: 1 })).toBeUndefined();
    expect(automationStudioRefutedResultLadderSkipped({ detail: built(run(), 1, undefined), namesStep: true, attempt: 1 })).toBeUndefined();
    expect(automationStudioRefutedResultLadderSkipped({ detail: run(), namesStep: true, attempt: 1 })).toBeUndefined();
  });

  it("counts only this repair's builds, not an earlier pass's", () => {
    expect(automationStudioRefutedResultLadderSkipped({ detail: built(built(run(), 1, 8), 2, 0), namesStep: true, attempt: 2 })).toBeUndefined();
  });

  it("writes a marker of its own on a run the route left none on", () => {
    expect(marker(automationStudioRefutedResultLadderSkipped({ detail: run(), namesStep: false, attempt: 1 }))).toEqual({ ladderSkipped: { reason: "names_no_step" } });
  });
});
