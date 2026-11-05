// What trust is read from, taken from the two places a version's runs are
// recorded: the verdict rows of a judged Flow run (`flow_graph_judgements`), and
// the rows a part run of the library writes (`project_part_runs`).
import type { AutomationStudioFlowGraphJudgementRecord, AutomationStudioProjectPartRunRecord } from "../../../framework/persistence/automation/index.ts";
import type { AutomationStudioPartTrustEvidence } from "./types.ts";

/** A judged run's verdict, as evidence. The caller passes the rows of the graph revision the version came from. */
export function partTrustEvidenceFromJudgements(rows: readonly Pick<AutomationStudioFlowGraphJudgementRecord, "status" | "zeroModel" | "decidedAtMs">[]): AutomationStudioPartTrustEvidence[] {
  return rows.map((row) => ({ result: row.status, zeroModel: row.zeroModel, atMs: row.decidedAtMs }));
}

/**
 * A part run, as evidence: it succeeded or failed by its own end check, and a stop proves nothing.
 * A run a judged Flow run left its verdict on (`judged`) is that verdict: yes is confirmed, no is
 * refuted, and a yes at zero model calls is a replay, as a judgement row's is.
 */
export function partTrustEvidenceFromRuns(rows: readonly Pick<AutomationStudioProjectPartRunRecord, "outcome" | "modelCalls" | "finishedAtMs" | "judged">[]): AutomationStudioPartTrustEvidence[] {
  return rows.map((row) => ({ result: row.judged === "yes" ? "confirmed" : row.judged === "no" ? "refuted" : row.outcome === "succeeded" ? "confirmed" : row.outcome === "failed" ? "refuted" : "unverified", zeroModel: row.modelCalls === 0, atMs: row.finishedAtMs }));
}
