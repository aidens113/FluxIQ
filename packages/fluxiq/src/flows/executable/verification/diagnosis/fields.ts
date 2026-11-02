import type { LlmVerificationChecked } from "./checked-cell.ts";
import type { LlmVerificationDefect } from "./defect.ts";

/**
 * The one channel through which a model may contribute to a diagnosis.
 *
 * Every response's `metadata` is stripped on the way in, deliberately: it is an
 * open field and an open field is a way to smuggle arbitrary JSON past the
 * recognized-field allowlist. That left no channel at all, so the structured
 * diagnosis the runtime builds was entirely Core's own verdicts and the model's
 * answer was a sentence of prose nobody could act on.
 *
 * This is the narrow replacement: a named field, with a fixed set of keys, each
 * bounded to a value Core can check without knowing anything about the medium
 * the failure happened in. It is a channel, not an opening -- `metadata` is
 * still stripped, and an unrecognized key inside `diagnosis` is still refused.
 */

export type LlmDiagnosisFields = {
  /** What the run was supposed to achieve, in the model's words. */
  expected?: string;
  /** What it observed instead. */
  observed?: string;
  /** What the model thinks changed between the two. */
  changed?: string;
  /** Whether the goal is still reachable. Core refuses an answer here that would talk it past a control a person must clear. */
  stillAchievable?: "yes" | "no" | "unknown";
  /** Whether a deterministic recovery Core already holds would serve. */
  deterministicRecoveryPossible?: "yes" | "no" | "unknown";
  /** Whether more evidence is needed before anything is changed. */
  explorationNeeded?: boolean;
  /** Whether a change to the Flow is needed at all. The one field that can stop the patch call. */
  patchNeeded?: boolean;
  /**
   * Whether the result a finished run produced answers what was asked for.
   *
   * The one field a `loop_verification` call is made for, and the reason that
   * call needs no response kind of its own: it is the same three words as the
   * two verdicts above, read the same way. `yes` answers, `no` does not, and
   * `unknown` -- like an omitted field -- is a run nobody confirmed, which the
   * result verification fails closed on rather than letting it read as a pass.
   */
  answersRequest?: "yes" | "no" | "unknown";
  /**
   * A `loop_verification` no only (t752): each defect of the result the no
   * rests on, so Core can find it in its own record rather than read it out of
   * prose (`../../result-verification/agreement/`). A no that names none Core
   * can locate is not a no. Optional for persisted legacy diagnoses and unrelated tasks. Current negative
   * verification replies require a well-formed list, including an explicit empty one.
   */
  defects?: LlmVerificationDefect[];
  /** A `loop_verification` yes only (t810): the stored cells it checked, which Core finds in its own record (`../../result-verification/cited-yes/`). */
  checked?: LlmVerificationChecked[];
};
