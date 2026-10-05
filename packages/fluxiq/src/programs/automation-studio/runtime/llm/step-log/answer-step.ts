import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE } from "../repeat-guard/index.ts";
import { automationStudioLlmProviderUnanswered } from "../unanswered-calls.ts";
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
  /**
   * The whole `core.amendment_check` value Core put in front of the model for
   * this decision (`../draft-amendment-feedback.ts`): each refusal's `next`, the
   * positions, the reasons' sentences and the progress counts. Run
   * `run-musp8nz1-dbd3905a` (t174-w108 R3) kept only the codes here, so what
   * the model read was in the next request alone.
   */
  amendmentCheck?: unknown;
};

/**
 * What Core made of a decision it answered without running a tool:
 * `applied` (every amendment landed, or a `rerun` was turned into its call),
 * `partly_applied`, `refused` (each refusal with its reason), or `ignored`
 * (it changed nothing and nothing was refused: an edit that put the draft back
 * as it stood, or one with nothing to do).
 */
export type AutomationStudioLlmStepLogAnswerVerdict = "applied" | "partly_applied" | "refused" | "ignored";

/**
 * One evidence entry Core itself showed the model about a decision -- the
 * decision check, a completion's refusal, the dry run's verdict, the note on a
 * request answered from memory, a stall redirect -- as the model was shown it.
 */
export type AutomationStudioLlmStepLogCoreEntry = { callId: string; toolId: string; value: unknown };

/** An answer step already written, completed once the next decision is about to be asked. */
export type AutomationStudioLlmStepLogAnswerStep = {
  /**
   * Rewrites the answer with every entry Core showed for it. Core tells the
   * model about some decisions after recording their row (an unusable
   * decision's check, a redirect), so the answer is written when the row is
   * recorded and completed when the next decision starts; a row that ended the
   * loop keeps what it was written with, since nothing more was said.
   */
  shown(feedback: ReadonlyArray<AutomationStudioLlmStepLogCoreEntry>): void;
};

/**
 * The amendment answer each row was written with, so what Core told the model
 * of that row, known only once its guard has counted the row, joins the same
 * step (`told`) rather than opening another.
 */
const written = new WeakMap<object, { tell(told: unknown): void }>();

/** The codes of a call refused unrun as a repeat (`../decision-handlers/refused-repeat.ts`, `../decision-handlers/answered-request.ts`). */
const REPEAT_REFUSALS = new Set([AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, "llm_evidence_loop.rejected.repeat_without_progress"]);

/**
 * The codes of a call answered from what the loop already holds, never run
 * (`../evidence-loop/answered-request.ts`, whose `ANSWERED_REQUEST` keys these
 * are; spelled out here so the step log takes nothing from the loop).
 */
const ANSWERED_REQUESTS = new Set(["llm_evidence_loop.already_answered", "llm_evidence_loop.already_observed", "llm_evidence_loop.not_offered", "llm_evidence_loop.looked_again_unchanged"]);

/**
 * Writes Core's answer to a decision that ran no tool as a step of its own:
 * `NNNN-answer-amend_draft/`, `NNNN-answer-unusable/` for a decision Core
 * refused (a reply of no decision shape, a completion the check or the dry run
 * refused, a call not offered), or `NNNN-answer-<toolId>/` for a call refused
 * as a repeat or answered from memory. `result.json` says what Core did with
 * it -- the verdict, the code, how many amendments landed, each refusal with
 * its reason, the steps a refusal listed, `feedback` (the entries Core showed
 * the model about it), and as `told` the amendment answer word for word when
 * the row carries it -- and `meta.json`, last, the same in brief. Such a
 * decision used to leave only its model step, so Core's answer could be read
 * only from the next request (`run-murzln6g-11debe1d`: `S/0024`-`S/0028`,
 * `S/0036`; `run-musp39u8-9ac026ab`: `0179`-`0183`, `0279`, `0290`). A
 * decision call the provider never answered was told nothing and writes
 * nothing; any other row has its tool step already and writes nothing; so does
 * every row with the step log off. Every file is screened as every step file
 * is (`./files.ts`). Best-effort: an answer that cannot be written never fails
 * the loop.
 *
 * `told` is the amendment check Core showed the model for this row
 * (`../decision-handlers/amendment.ts`). Core builds it after the row is
 * recorded and written, so it is given by a second call with the same row
 * object, which rewrites that step's `result.json` with it; given for a row
 * not written before, the step is written with it.
 *
 * `feedback` reads the entries Core has shown the model about the row so far
 * (`../evidence-loop/trace.ts`); the returned step's `shown` completes them
 * once the next decision is about to be asked.
 *
 * `applied` counts what the row's draft change counts (`draftChange.appliedCount`),
 * a rerun the decision asked for included: step 0061 of `run-musq0b1m-0472cfa0`
 * read `applied: 0` beside `appliedCount: 1` (t174-w116).
 */
export function automationStudioLlmStepLogAnswer(
  row: AutomationStudioLlmStepLogAnsweredRow,
  env: Readonly<Record<string, string | undefined>> = process.env,
  told?: unknown,
  feedback: () => ReadonlyArray<AutomationStudioLlmStepLogCoreEntry> = () => []
): AutomationStudioLlmStepLogAnswerStep | undefined {
  const directory = automationStudioLlmStepLogDirectory(env);
  if (!directory) return undefined;
  const before = told === undefined ? undefined : written.get(row);
  if (before) {
    before.tell(told);
    return undefined;
  }
  const amendment = row.decision === "amend_draft";
  const code = typeof row.resultCode === "string" ? row.resultCode : undefined;
  const refusedDecision = row.decision === "unusable" && !(code !== undefined && automationStudioLlmProviderUnanswered([code]));
  const repeat = !amendment && code !== undefined && REPEAT_REFUSALS.has(code);
  const refusedCall = repeat || (row.decision === "tool_call" && code !== undefined && ANSWERED_REQUESTS.has(code));
  const refused = refusedDecision || refusedCall;
  if (!amendment && !refused) return undefined;
  let step: AutomationStudioLlmStepLogAnswerStep | undefined;
  try {
    const subject = amendment ? "amend_draft" : refusedDecision ? "unusable" : automationStudioLlmStepLogNaming.toolSegment(row.toolId ?? "unnamed");
    let folder: AutomationStudioLlmStepLogFolder;
    try {
      folder = automationStudioLlmStepLogOpenFolder(directory, `answer-${subject}`);
    } catch (error) {
      if (automationStudioLlmStepLogFolderRefused(error)) return undefined;
      throw error;
    }
    const amendmentsRefused = (row.amendmentsRefused ?? []).map((refusal) => ({ step: refusal.step, reason: refusal.reason, ...(refusal.nodeId ? { nodeId: refusal.nodeId } : {}) }));
    const counted = (row.draftChange as { appliedCount?: unknown } | undefined)?.appliedCount;
    const applied = typeof counted === "number" && Number.isSafeInteger(counted) && counted >= 0 ? counted : row.amended ?? 0;
    const verdict: AutomationStudioLlmStepLogAnswerVerdict = refused ? "refused" : amendmentVerdict(row.resultCode, applied, amendmentsRefused.length);
    const reason = refused ? code ?? null : verdict === "ignored" ? row.resultCode ?? null : null;
    const scope = automationStudioLlmStepLogScope.current();
    const at = new Date().toISOString();
    const files = automationStudioLlmStepLogWriter(folder.path);
    let check = told ?? row.amendmentCheck;
    let shownSoFar = feedback();
    const result = (): Record<string, unknown> => {
      const entries = shownSoFar.map((entry) => ({ callId: entry.callId, toolId: entry.toolId, value: entry.value }));
      const steps = listedSteps(entries);
      return {
        iteration: row.iteration,
        decision: row.decision,
        ...(row.toolId ? { toolId: row.toolId } : {}),
        verdict,
        resultCode: row.resultCode ?? null,
        ...(row.resultReason ? { resultReason: row.resultReason } : {}),
        ...(reason ? { reason } : {}),
        ...(amendment ? { applied, refused: amendmentsRefused } : {}),
        ...(steps.length ? { steps } : {}),
        ...(entries.length ? { feedback: entries } : {}),
        ...(row.draftChange !== undefined ? { draftChange: row.draftChange } : {}),
        ...(row.progress !== undefined ? { progress: row.progress } : {}),
        ...(amendment && check !== undefined ? { told: check } : {})
      };
    };
    const write = (): string => {
      const steps = listedSteps(shownSoFar);
      const summary = repeat
        ? `refused ${code}${row.resultReason ? ` (the same call before: ${row.resultReason})` : ""}`
        : refused
          ? `refused ${code ?? "unusable"}${steps.length ? `: steps ${steps.join(", ")}` : ""}`
          : `amend_draft ${verdict}${amendmentsRefused.length ? `: ${[...new Set(amendmentsRefused.map((refusal) => refusal.reason))].join(", ")}` : reason ? `: ${reason}` : ""}`;
      files.json("result.json", result());
      files.meta({
        step: folder.step, kind: "answer", iteration: row.iteration, decision: row.decision, toolId: row.toolId ?? null,
        startedAt: at, finishedAt: at, ms: 0,
        part: scope?.part ?? null, round: scope?.round ?? null, phase: scope?.phase ?? "explore",
        status: "ok", verdict, resultCode: row.resultCode ?? null, resultReason: row.resultReason ?? null,
        summary
      });
      return summary;
    };
    const summary = write();
    automationStudioLlmStepLogListStep(directory, { step: folder.step, kind: "answer", tool: row.toolId, summary, costUsd: undefined });
    if (amendment) {
      written.set(row, {
        tell: (value) => {
          check = value;
          try {
            files.json("result.json", result());
          } catch {
            /* best-effort: an answer step never fails the loop */
          }
        }
      });
    }
    step = {
      shown: (more) => {
        if (sameEntries(shownSoFar, more)) return;
        shownSoFar = more;
        try {
          write();
        } catch {
          /* best-effort: an answer step never fails the loop */
        }
      }
    };
  } catch {
    /* best-effort: an answer step never fails the loop; one not written is not completed */
  }
  return step;
}

/** The draft positions a refusal listed (`steps: [{ step }]`, as the dry run and the completion check write them), each once, in order. */
function listedSteps(entries: ReadonlyArray<AutomationStudioLlmStepLogCoreEntry>): number[] {
  const steps = new Set<number>();
  for (const entry of entries) {
    const listed = isRecord(entry.value) && Array.isArray(entry.value.steps) ? entry.value.steps : [];
    for (const item of listed) if (isRecord(item) && typeof item.step === "number" && Number.isInteger(item.step)) steps.add(item.step);
  }
  return [...steps];
}

function sameEntries(left: ReadonlyArray<AutomationStudioLlmStepLogCoreEntry>, right: ReadonlyArray<AutomationStudioLlmStepLogCoreEntry>): boolean {
  return left.length === right.length && left.every((entry, index) => entry.callId === right[index]!.callId && entry.value === right[index]!.value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function amendmentVerdict(resultCode: string | undefined, applied: number, refused: number): AutomationStudioLlmStepLogAnswerVerdict {
  if (resultCode === "llm_evidence_loop.draft_rerun") return refused ? "partly_applied" : "applied";
  if (applied > 0 && resultCode !== "llm_evidence_loop.draft_amendment_undone") return refused ? "partly_applied" : "applied";
  return refused ? "refused" : "ignored";
}
