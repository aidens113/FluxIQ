// A refusal that invites its own resend admits that one resend (t650).
//
// **The failure this closes.** A8 frozen pair 4, candidate towels
// `run-mva446jf-926a3c72`, steps 0044-0050: a submission dropping a condition
// Core's record kept was refused `candidate.kept_condition_dropped`, whose
// words end "submit the same change again: Core refuses this once, not twice"
// (t641, `../../flow-bootstrap/candidate/submission.ts`). The model did. The
// repeat guard (`./outcomes.ts`) had recorded the refusal as `failed` under
// the call's key -- its tool, its page and, for a submission, the revision
// standing, which the refusal left standing on purpose -- so the invited
// resend matched that key and was refused unrun
// (`llm_evidence_loop.repeat_refused`). Three in a row ended the build: Core's
// invitation was one its own guard could never let through.
//
// **The rule.** A refusal says it invites its resend in a machine field Core
// writes, never in words: `diagnostics.resend` is `"accepted_once"`
// (`AutomationStudioLlmEvidenceResendInvitation`). The guard then records no
// failure for that call's key the first time, so the identical call runs once
// more and reaches the controller that invited it. A second refusal on the
// same key, invited or not, is recorded as `failed` as every refusal is, so
// the invitation admits exactly one resend; any refusal without the field is
// guarded exactly as before. The field is read from the refusal's own JSON,
// not from the model's input, and this module names no build code: any tool
// whose refusal carries it is treated alike.

/** The mark a refusal carries, under `diagnostics.resend`, when the identical call sent again once is accepted (header). */
export type AutomationStudioLlmEvidenceResendInvitation = "accepted_once";

/** The mark's one value (header). */
const ACCEPTED_ONCE: AutomationStudioLlmEvidenceResendInvitation = "accepted_once";

/** Which refused calls' keys have had their one invited resend admitted. */
export type AutomationStudioLlmEvidenceResendAdmission = {
  /**
   * Whether the refusal recorded under `key`, whose answer is `answer`, is
   * one to admit a resend of: it invites one and none was admitted under
   * this key yet. Answering yes uses that key's one admission.
   */
  admits(key: string, answer: string | undefined): boolean;
};

/** A fresh record of admitted resends, one per loop's repeat guard (header). */
export function automationStudioLlmEvidenceResendAdmission(): AutomationStudioLlmEvidenceResendAdmission {
  const admitted = new Set<string>();
  return {
    admits(key, answer) {
      if (admitted.has(key) || !invitesResend(answer)) return false;
      admitted.add(key);
      return true;
    }
  };
}

/** Whether a refusal's answer, read as its own JSON, carries the mark under `diagnostics.resend`. */
function invitesResend(answer: string | undefined): boolean {
  const value = parsed(answer);
  if (!isObject(value) || value.ok !== false || !isObject(value.diagnostics)) return false;
  return value.diagnostics.resend === ACCEPTED_ONCE;
}

/** An answer read as JSON; nothing for an answer in plain words. */
function parsed(answer: string | undefined): unknown {
  if (answer === undefined) return undefined;
  try {
    return JSON.parse(answer);
  } catch (error) {
    // The one failure that means "not JSON": an answer in plain words, which carries no mark. Anything else is rethrown.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
