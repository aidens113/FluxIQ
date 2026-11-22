// What every tool call of an attempt goes through, in the order the design fixes:
//
//   permission gate -> act gate -> row sink -> the domain
//
// The permission gate is the build's own (`flow-bootstrap/action-permissions.ts`), and wraps what
// this returns. A forward run's passes reach this too, because each is sent through the loop's
// executor. The first lasting act reads the "before" witness first, and only then is dispatched.
//
// **What the sink is told is the call's answer alone**, never a model's words (plan D9), and
// the chain counts what reached the domain as the attempt's live steps. The sink stores every read's
// rows; the attempt's one result (`../result-feed/`, lane t905) says which of them are the answer: a
// read made with `add` is a draft step's page, any other is a look. Every read's answer carries the
// ledger's line beside what the domain answered (`resultNote`): how the result changed, or that it was
// a look and the result is unchanged (run-mwafor01-bb471f52, run-mwaudvnh-c208d32c). Without it the
// model cannot tell from the read whether the rows it holds are in the result.
//
// **Nothing is put back on this path (D1).** A forward run sends no reset by construction, and a
// model's `amend_draft` rerun sends none either: the round tells the loop it reruns in place
// (`rerunsInPlace`, `./round.ts`), so a rerun runs from the page as it stands and says so
// (`../../../../../runtime/llm/node-tools/step-place.ts`, `forward_run`; run `run-mwc60eal-4c9fdf6f`).
// A reset that still reaches this chain is Core's defect, and is refused here as a backstop, before
// anything is sent: it would take the page away from what the attempt did. The refusal says what
// was not done and what to do, and blames nothing on the task.
//
// **What the domain says of a call is asked for here (`describe`).** A person's words for an act,
// and what the call would be before it is sent, which the act gate reads beside the call (t870:
// a by-hand press by a handle says nothing else). It is asked for every call, so an answer that
// throws or has another shape is no answer, and never stops the call.
//
// **What a look found, after the first lasting act, is told on (`looked`; lane B, run-mw4dsh8i-3fb9dc39).**
// A check said unsure and named what it could not see; the model opened that page and searched it,
// and found it, but a look was in nothing the check read, so the next completion was refused as the
// same evidence until a person was asked. So each look that answers -- an observation the act gate
// also reads as one (`automationStudioAttemptActAnswerRead`), not refused, holding no rows (a read's
// rows are the summary's own) -- is handed on from the call's own answer, never a model's words, once
// the act record holds an act (an earlier attempt's carried one included): a look before any act
// shows the page as it was, not what the acts made of it. What is handed on is where (the answer's
// `location`) and what the call itself found, whole: a search's `found` lines, a single read's value
// under the domain's declared read key (`readRowsKey`, a value there and not rows), a described
// element's `element`, and only where the call found none of those the page it read (`page`); the
// web domain's keys (`domain/.../page-find/search.ts`, `.../tools.ts`). It is never cut: run
// run-mwbkuxqt-c57f42cb's judge was given a read's look as the first 600 characters of the page
// after the read, which did not hold the line the read returned, and was told it was a cut, so it
// could not take the line as seen. The same look again is handed on once only, so a repeated look is
// no new evidence. The completion check screens what it is given and keeps every distinct look
// (`../completion/check.ts`).
//
// **Every call that reached the domain is handed on as a trail step (`trailed`, t963).** The judge sees
// everything the attempt did to get its result: each call as it was sent and the domain's whole answer,
// in the order they ran, before and after any act (`runtime/result-verification/run-trail/of/call.ts`).
// Only calls that reached the domain: one the gates refused never touched the site.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioAttemptActAnswerRead, automationStudioAttemptActGate, type AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioFlowDraftDeclaresLasting } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import { automationStudioResultTrailStepOfCall, type AutomationStudioResultTrailStep, type AutomationStudioResultTrailSemanticOptions } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultFeed } from "../result-feed/index.ts";
import type { AutomationStudioAnswerFirstRowSink } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstWitnesses } from "../witnesses/index.ts";

type Execute = AutomationStudioHarnessOptionLoopBinding["executeTool"];

const NO_RESET_CODE = "answer_first.no_reset";
const NO_RESET_SAID = "This call would have put the page back to an earlier place, and an attempt goes on from the page as it stands, so nothing was sent and the page did not move. Carry on from here; to work on another page, go to it with an ordinary call.";

/** The keys a search's and a description's answer hold what they found under (header): the web domain's own (`domain/.../page-find/search.ts`, `domain/.../describe`). */
const FOUND_KEY = "found";
const ELEMENT_KEY = "element";
/** The page a call read, which is what it found only where it found nothing more particular (header). */
const PAGE_KEY = "page";
/** Where a read's answer carries the result's line (header). */
const RESULT_NOTE_KEY = "resultNote";

/** The chain under the permission gate (header). */
export function automationStudioAnswerFirstCallChain(input: {
  domain: Execute;
  record: AutomationStudioAttemptActRecord;
  sink: Pick<AutomationStudioAnswerFirstRowSink, "fromCall">;
  /** The attempt's one result, told every call's answer and what the sink stored of it (header). Absent, no read is told anything. */
  result?: Pick<AutomationStudioAnswerFirstResultFeed, "called"> | undefined;
  witnesses: Pick<AutomationStudioAnswerFirstWitnesses, "beforeFirstLastingAct">;
  readRowsKey: string | undefined;
  describe: ((call: { toolId: string; value: JsonObject }) => { target?: string | undefined; wouldRunWith?: JsonObject | undefined } | undefined) | undefined;
  /** One call reached the domain. */
  stepped(): void;
  /** A call was answered and not refused: the page has got to where the work starts. */
  answered(): void;
  /** A look that found something new, after the first lasting act (header). Absent, nothing is handed on. */
  looked?: ((look: { where: string; found: string; callId?: string }) => void) | undefined;
  /** Every call that reached the domain, with its answer, in order (header). Absent, nothing is handed on. */
  trailed?: ((step: AutomationStudioResultTrailStep) => void | Promise<void>) | undefined;
  /** Explicitly forwards the bound projector and current privacy declaration; absent keeps old chain callers compatible. */
  judgeEvidence?: AutomationStudioResultTrailSemanticOptions | undefined;
}): Execute {
  const handedOn = new Set<string>();
  const noteLook = (answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult, callId: string) => {
    if (!input.looked || input.record.acts().length === 0) return;
    const look = lookOf(answer, input.readRowsKey);
    if (!look) return;
    const key = JSON.stringify([look.where, look.found]);
    if (handedOn.has(key)) return;
    handedOn.add(key);
    input.looked(input.judgeEvidence?.judgeEvidenceVersion === 1 ? { ...look, callId } : look);
  };
  const stored: Execute = async (call) => {
    input.stepped();
    const answer = await input.domain(call);
    if (!refusedAnswer(answer)) input.answered();
    const rows = isExecution(answer) ? await input.sink.fromCall({ callId: call.callId, toolId: call.toolId, value: call.value }, answer) : undefined;
    try {
      noteLook(answer, call.callId);
    } catch {
      /* best-effort: a look's note is evidence for a later check, never a reason to lose the call's answer */
    }
    try {
      if (input.trailed) {
        const about = described({ toolId: call.toolId, value: call.value });
        const on = "said" in about && typeof about.said?.target === "string" ? about.said.target : undefined;
        await input.trailed(automationStudioResultTrailStepOfCall({ callId: call.callId, toolId: call.toolId, value: call.value }, answer, on, input.judgeEvidence));
      }
    } catch {
      /* best-effort: the trail is evidence for a later check, never a reason to lose the call's answer */
    }
    // The result's line goes on the read's own answer (header); the trail above keeps the domain's answer as it came.
    const recorded = isExecution(answer) ? input.result?.called({ callId: call.callId, toolId: call.toolId, value: call.value }, answer, rows) : undefined;
    const line = rows?.failure ? `The read's rows could not be stored (${rows.failure.code}). They did not enter the result. Recover the read before claiming these rows.` : recorded;
    return isExecution(answer) && line ? withResultNote(answer, line) : answer;
  };
  const described = (call: { toolId: string; value: JsonObject }) => {
    try {
      return { said: input.describe?.(call) };
    } catch {
      return { threw: true as const };
    }
  };
  const gated = automationStudioAttemptActGate({
    record: input.record,
    executeTool: stored,
    ...(input.readRowsKey ? { readRowsKey: input.readRowsKey } : {}),
    wordsOf: (call, answer) => {
      const about = described(call);
      const named = "said" in about ? about.said?.target : undefined;
      // A press by hand may name no handle the build was shown: then what it pressed is in its own answer (`draft.control`), and that is what a person reads, not a line for its class.
      const target = typeof named === "string" && named ? named : isExecution(answer as JsonValue) ? (answer as AutomationStudioLlmEvidenceToolExecutionResult).draft?.control : undefined;
      return target ? { what: target } : undefined;
    },
    foresee: (call) => {
      const about = described(call);
      if (!("said" in about) || typeof about.said !== "object" || about.said === null) return undefined;
      const { target, wouldRunWith } = about.said;
      return { ...(typeof target === "string" ? { words: target } : {}), ...(isObject(wouldRunWith) ? { parameters: wouldRunWith } : {}) };
    }
  });
  return async (call) => {
    if (call.value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: NO_RESET_CODE, instruction: NO_RESET_SAID }, effectApplied: false, targetsUnchanged: true, resultCode: NO_RESET_CODE };
    if (declaresLasting(call.value)) await input.witnesses.beforeFirstLastingAct();
    return await gated(call);
  };
}

/** The answer with the result's line beside what the domain answered (header). */
function withResultNote(answer: AutomationStudioLlmEvidenceToolExecutionResult, line: string): AutomationStudioLlmEvidenceToolExecutionResult {
  const evidence: JsonValue = isObject(answer.evidence) ? { ...answer.evidence, [RESULT_NOTE_KEY]: line } : { answered: answer.evidence, [RESULT_NOTE_KEY]: line };
  return { ...answer, evidence };
}

/** A call that says it does something lasting, and is not only a check of a step. */
function declaresLasting(value: JsonObject): boolean {
  if (value.replay === "verify" || value.replay === "reset" || value.write === true) return false;
  const nested = value.parameters;
  const inner = typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested.consequences : undefined;
  return automationStudioFlowDraftDeclaresLasting(value.consequences) || automationStudioFlowDraftDeclaresLasting(inner);
}

/** Where a look was made and what it found, whole, from its own answer (header), or nothing for any other call. */
function lookOf(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult, readRowsKey: string | undefined): { where: string; found: string } | undefined {
  if (!isExecution(answer)) return undefined;
  const evidence = answer.evidence;
  if (!isObject(evidence)) return undefined;
  const said = automationStudioAttemptActAnswerRead(answer, readRowsKey);
  if (!said.looked || said.reads.length > 0) return undefined;
  const where = typeof evidence.location === "string" ? evidence.location.trim() : "";
  const particular = [evidence[FOUND_KEY], readValue(evidence, readRowsKey), evidence[ELEMENT_KEY]].map(text).filter((found) => found !== "");
  const found = particular.length ? particular.join("\n") : text(evidence[PAGE_KEY]);
  return where && found ? { where, found } : undefined;
}

/**
 * The value a single read returned, at the domain's read key (`holder.member`, as the act gate reads it,
 * `automationStudioAttemptActAnswerRead`). A list there is a list read's rows, never a look: rows are the
 * summary's own, and a list read that kept none is said by the summary's read pages.
 */
function readValue(evidence: JsonObject, key: string | undefined): JsonValue | undefined {
  if (!key) return undefined;
  let value: JsonValue | undefined = evidence;
  for (const part of key.split(".")) value = isObject(value) ? value[part] : undefined;
  return Array.isArray(value) ? undefined : value;
}

/** What a found value says, whole: words as they are, any other value as its JSON, and nothing for none. */
function text(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  return (typeof value === "string" ? value : JSON.stringify(value)).trim();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function refusedAnswer(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): boolean {
  if (!isExecution(answer)) return false;
  const evidence = answer.evidence;
  return answer.failure !== undefined || (typeof evidence === "object" && evidence !== null && !Array.isArray(evidence) && evidence.ok === false);
}

function isExecution(answer: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): answer is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof answer === "object" && answer !== null && !Array.isArray(answer) && answer.kind === "llm_evidence_tool_execution";
}
