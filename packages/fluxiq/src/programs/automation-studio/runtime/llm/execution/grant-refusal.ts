// Why a grant would not be claimed, as a code rather than a sentence.
//
// This is its own file because the refusal is its own thing: `execution-grants.ts`
// owns the store that mints, holds and claims a grant, and this owns the one
// answer that store gives when it will not. Keeping them together put a second
// exported class in a file already at its line limit, which the structure audit
// refuses on both counts -- correctly, because a caller that only needs to read
// a refusal code should not have to import the whole grant service to do it.

/**
 * Why a grant would not be claimed, as a code rather than a sentence.
 *
 * Every refusal on the claim path was a plain `Error` with a fixed sentence,
 * and the one caller that matters -- the recovery's provider resolution -- has
 * a bare `catch {}` that discards it. So a run whose repair could not start
 * recorded `llm.provider_resolution_failed` and nothing else, which names the
 * step that failed and not one thing about why.
 *
 * Live run `run-muexhp0k-73172f73` (2026-09-24) is the cost. It built a Flow,
 * replayed it, extracted sixteen of sixteen records, had its result correctly
 * refuted, and then its repair died here -- with 29 of 48 calls and $0.227 of
 * its $0.25 unspent, and its 250s well inside the 600s run window, so none of
 * the obvious answers fit and the artifact could not settle it.
 *
 * Four codes, because the four are different problems with different answers: a
 * grant that is gone or spent, one asked for under the wrong scope, one whose
 * world changed underneath it -- the session, the key, the Flow's own execution
 * digest -- and a purpose that is not one of Core's. The third is the one a
 * Flow-creating run is most likely to meet, because writing the Flow is itself
 * a change to what the grant was minted against.
 */
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES = Object.freeze({
  unavailable: "llm.execution_grant_unavailable",
  scope_mismatch: "llm.execution_grant_scope_mismatch",
  no_longer_valid: "llm.execution_grant_no_longer_valid",
  purpose_invalid: "llm.execution_grant_purpose_invalid"
} as const);

export type AutomationStudioLlmExecutionGrantRefusalCode =
  (typeof AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES)[keyof typeof AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES];

/**
 * A refusal from the claim path, carrying Core's code beside Core's sentence.
 *
 * It extends `Error` and keeps the sentence each throw already used, so every
 * existing caller -- and every test that reads a message -- behaves exactly as
 * it did. What is new is that a caller may now ask what kind of refusal it was
 * without parsing prose.
 */
export class AutomationStudioLlmExecutionGrantRefusal extends Error {
  readonly code: AutomationStudioLlmExecutionGrantRefusalCode;
  constructor(code: AutomationStudioLlmExecutionGrantRefusalCode, message: string) {
    super(message);
    this.name = "AutomationStudioLlmExecutionGrantRefusal";
    this.code = code;
  }
}

/** This refusal's code, or `undefined` for anything that is not one. */
export function automationStudioLlmExecutionGrantRefusalCode(error: unknown): AutomationStudioLlmExecutionGrantRefusalCode | undefined {
  return error instanceof AutomationStudioLlmExecutionGrantRefusal ? error.code : undefined;
}
