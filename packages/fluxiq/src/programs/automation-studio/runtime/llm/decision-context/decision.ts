// What one evidence-loop decision was, and what Core answered it, as the
// decision history records it.
//
// The model is sent a window of evidence, the draft and a budget entry. Its own
// earlier decisions are sent nowhere: the reply's summary is discarded, there is
// no conversation, and Core's notes about a decision -- a refused completion, an
// answered repeat, a refused amendment -- leave the window with no trace. A
// model that cannot see it already made a decision makes it again; the recorded
// builds of 2026-09-28 re-asked one request eleven times and resent a refused
// completion while the refusal was still in front of them.
//
// So every decision gets one row here. **Nothing on a row is page content or
// model prose.** Every field is Core's own bookkeeping (a call id, a result
// code, a count, a position) or an identifier the model itself wrote (a tool id,
// an action id). A completion's refusal feedback is kept only as the closed
// codes `./closed-detail.ts` lets through; the feedback itself is never held.
//
// `signature` is what makes two decisions the same decision. The caller
// computes it with `./signature.ts` from the decision the model sent, so an
// executed call and a later request answered from memory carry the same one.

import type { JsonObject } from "../../../../../core/index.ts";

/** Whether a call changed what a later look would see. */
export type AutomationStudioLlmDecisionContextChange = "yes" | "no" | "unknown";

/** One step a dry run did not replay, and how it answered. */
export type AutomationStudioLlmDecisionContextDryRunRefusal = { step: number; status: string };

/**
 * What the replay of the draft said when a completion reached it: every step
 * replayed (`clean`), the same draft had already replayed clean and was not
 * replayed again (`reused_clean`), no replay applied to it (`not_run`: the dry
 * run is off, or the draft does not say how to replay), or the steps it
 * refused.
 */
export type AutomationStudioLlmDecisionContextDryRun = "clean" | "reused_clean" | "not_run" | readonly AutomationStudioLlmDecisionContextDryRunRefusal[];

/** One amendment the draft refused, and whether it had refused the same one before. */
export type AutomationStudioLlmDecisionContextAmendmentRefusal = { step: number; reason: string; repeated: boolean };

/** One decision and Core's answer, as the caller reports it. */
export type AutomationStudioLlmDecisionContextDecision =
  /**
   * The look the loop takes before the model's first decision (iteration 0).
   * `refused` when it answered `{ok:false}` or failed: the model's first
   * decision starts from a refusal, so the row is never folded away.
   */
  | { kind: "look"; callId?: string; toolId?: string; resultCode?: string; refused?: boolean }
  /**
   * A tool call that ran. `refused` when the tool answered `{ok:false}`. The
   * loop's signature for a call is its repeat-policy request signature, which
   * carries the state it was asked in, so only a request asked again over the
   * same state is the same decision.
   */
  | {
      kind: "call";
      signature: string;
      callId: string;
      toolId: string;
      actionId?: string;
      resultCode: string;
      changed: AutomationStudioLlmDecisionContextChange;
      refused?: boolean;
    }
  /** A tool call that threw or failed part way; `code` is the failure's code. */
  | { kind: "call_failed"; signature: string; callId: string; toolId: string; actionId?: string; code: string }
  /** A request answered from memory: nothing ran, `answeredByCallId` holds the result. */
  | { kind: "answered"; signature: string; toolId: string; actionId?: string; code: string; answeredByCallId: string }
  /**
   * An amend_draft decision: how many amendments applied, which were refused,
   * the positions of withdrawn steps that had changed the page, and, where the
   * amendment did so, the iteration it undid back to and the step it reran.
   * `refusals` includes the amendments held for the rerun and refused once it
   * had run (`../decision-handlers/amendment.ts`), and `changed` says whether
   * the decision changed the draft at all: a rerun that put an identical step
   * back with the same result changed nothing, whatever "applied" (live run
   * `run-muwaobm2-882cadd9`, iterations 19-24, each shown "applied: 1").
   * `notRunAs` is the code a decision refused before any of it ran is refused
   * under (`../repeat-guard/outcomes.ts`, `same_amendment`).
   */
  | {
      kind: "amendment";
      signature: string;
      applied: number;
      refusals: readonly AutomationStudioLlmDecisionContextAmendmentRefusal[];
      withdrewChanged: readonly number[];
      undoneTo?: number;
      rerun?: number;
      changed?: AutomationStudioLlmDecisionContextChange;
      notRunAs?: string;
    }
  /**
   * A complete decision. It is the same attempt as an earlier one when it met
   * the same answer (accepted, and the same issue codes) over the same
   * `draftRevision`: the result itself is mostly the model's prose -- a summary
   * reworded every time -- so a completion resent over an unchanged draft and
   * refused again for the same codes is the repeat, whatever it said. `feedback`
   * is the refusal feedback as the completion check wrote it; only its closed
   * codes are kept.
   */
  | {
      kind: "completion";
      signature: string;
      draftRevision: number;
      accepted: boolean;
      issueCodes: readonly string[];
      feedback?: unknown;
      dryRun: AutomationStudioLlmDecisionContextDryRun;
    }
  /** A reply Core could not use as a decision. */
  | { kind: "unusable"; signature: string; issueCodes: readonly string[] }
  /** The no-progress redirect Core gave at an iteration. Not a decision of the model's. */
  | { kind: "redirect"; code?: string };

/**
 * One row as the recorder holds it. `detail` is the completion feedback's
 * closed codes; `firstSeenAt` is the first iteration the same decision was made,
 * when that was earlier than this one.
 */
export type AutomationStudioLlmDecisionContextRecord = {
  iteration: number;
  decision: AutomationStudioLlmDecisionContextDecision;
  detail?: JsonObject;
  firstSeenAt?: number;
};

/**
 * How often a decision has been made, this one included, and at which
 * iterations, oldest first. For a completion "the same decision" is the same
 * answer against the same draft revision.
 */
export type AutomationStudioLlmDecisionContextRepeat = { times: number; iterations: readonly number[] };
