import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE } from "../repeat-guard/index.ts";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";
import { automationStudioLlmStepLogWriter } from "./files.ts";
import { automationStudioLlmStepLogFolderRefused, automationStudioLlmStepLogOpenFolder, type AutomationStudioLlmStepLogFolder } from "./folder.ts";
import { automationStudioLlmStepLogListStep } from "./listing.ts";
import { automationStudioLlmStepLogNaming } from "./naming.ts";
import { automationStudioLlmStepLogScope } from "./scope.ts";

/**
 * The members of a loop row (`../evidence-loop/trace.ts`) an answer step
 * reads, declared here so the step log takes no type from the loop that
 * feeds it.
 */
export type AutomationStudioLlmStepLogAnsweredRow = {
  iteration: number;
  decision: string;
  toolId?: string;
  resultCode?: string;
  resultReason?: string;
  amended?: number;
  amendmentsRefused?: ReadonlyArray<{ step: number; reason: string; nodeId?: string }>;
  draftChange?: unknown;
  progress?: unknown;
};

/**
 * What Core made of a decision it answered without running a tool:
 * `applied` (every amendment landed, or a `rerun` was turned into its call),
 * `partly_applied`, `refused` (each refusal with its reason), or `ignored`
 * (it changed nothing and nothing was refused: an edit that put the draft back
 * as it stood, or one with nothing to do).
 */
export type AutomationStudioLlmStepLogAnswerVerdict = "applied" | "partly_applied" | "refused" | "ignored";

/** The codes of a call refused unrun as a repeat (`../decision-handlers/refused-repeat.ts`, `../decision-handlers/answered-request.ts`). */
const REPEAT_REFUSALS = new Set([AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, "llm_evidence_loop.rejected.repeat_without_progress"]);

/**
 * Writes Core's answer to a decision that ran no tool as a step of its own,
 * `NNNN-answer-amend_draft/` or `NNNN-answer-<toolId>/` for a call refused as
 * a repeat: `result.json` says what Core did with it -- the verdict, the code,
 * how many amendments landed and each refusal with its reason -- and
 * `meta.json`, last, the same in brief. Such a decision used to leave only its
 * model step, so Core's answer could be read only from the next request
 * (`run-murzln6g-11debe1d`: `S/0024`-`S/0028`, `S/0036`). Any other row has
 * its tool step already and writes nothing; so does every row with the step
 * log off. Best-effort: an answer that cannot be written never fails the loop.
 */
export function automationStudioLlmStepLogAnswer(row: AutomationStudioLlmStepLogAnsweredRow, env: Readonly<Record<string, string | undefined>> = process.env): void {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return;
  const amendment = row.decision === "amend_draft";
  const repeat = !amendment && typeof row.resultCode === "string" && REPEAT_REFUSALS.has(row.resultCode);
  if (!amendment && !repeat) return;
  try {
    const subject = amendment ? "amend_draft" : automationStudioLlmStepLogNaming.toolSegment(row.toolId ?? "unnamed");
    let folder: AutomationStudioLlmStepLogFolder;
    try {
      folder = automationStudioLlmStepLogOpenFolder(directory, `answer-${subject}`);
    } catch (error) {
      if (automationStudioLlmStepLogFolderRefused(error)) return;
      throw error;
    }
    const refused = (row.amendmentsRefused ?? []).map((refusal) => ({ step: refusal.step, reason: refusal.reason, ...(refusal.nodeId ? { nodeId: refusal.nodeId } : {}) }));
    const applied = row.amended ?? 0;
    const verdict: AutomationStudioLlmStepLogAnswerVerdict = repeat ? "refused" : amendmentVerdict(row.resultCode, applied, refused.length);
    const reason = repeat ? row.resultCode! : verdict === "ignored" ? row.resultCode ?? null : null;
    const summary = repeat
      ? `refused ${row.resultCode}${row.resultReason ? ` (the same call before: ${row.resultReason})` : ""}`
      : `amend_draft ${verdict}${refused.length ? `: ${[...new Set(refused.map((refusal) => refusal.reason))].join(", ")}` : reason ? `: ${reason}` : ""}`;
    const scope = automationStudioLlmStepLogScope.current();
    const files = automationStudioLlmStepLogWriter(folder.path);
    files.json("result.json", {
      iteration: row.iteration,
      decision: row.decision,
      ...(row.toolId ? { toolId: row.toolId } : {}),
      verdict,
      resultCode: row.resultCode ?? null,
      ...(row.resultReason ? { resultReason: row.resultReason } : {}),
      ...(reason ? { reason } : {}),
      ...(amendment ? { applied, refused } : {}),
      ...(row.draftChange !== undefined ? { draftChange: row.draftChange } : {}),
      ...(row.progress !== undefined ? { progress: row.progress } : {})
    });
    const at = new Date().toISOString();
    files.meta({
      step: folder.step, kind: "answer", iteration: row.iteration, decision: row.decision, toolId: row.toolId ?? null,
      startedAt: at, finishedAt: at, ms: 0,
      part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? "explore",
      status: "ok", verdict, resultCode: row.resultCode ?? null, resultReason: row.resultReason ?? null,
      summary
    });
    automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "answer", tool: row.toolId, summary, costUsd: undefined });
  } catch {
    /* best-effort: an answer step never fails the loop */
  }
}

function amendmentVerdict(resultCode: string | undefined, applied: number, refused: number): AutomationStudioLlmStepLogAnswerVerdict {
  if (resultCode === "llm_evidence_loop.draft_rerun") return refused ? "partly_applied" : "applied";
  if (applied > 0 && resultCode !== "llm_evidence_loop.draft_amendment_undone") return refused ? "partly_applied" : "applied";
  return refused ? "refused" : "ignored";
}
