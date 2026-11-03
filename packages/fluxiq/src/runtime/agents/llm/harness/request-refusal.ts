// A model request Core refused to build, named.
//
// The packet's guards (`context-packet.ts`, `explored-evidence.ts`,
// `failure-evidence.ts`) threw plain errors, and a plain error reaching a build
// is classified by kind alone: `flow_bootstrap.unexpected_error`, with the
// message deliberately left behind. That is exactly what
// `run-mulxk0ro-36bf090d`'s wrong-answer repair recorded -- routed, no
// adaptation, "unexpected error" -- and which of a dozen guards had refused
// could not be said from anything the run kept. So every guard throws this
// instead, with a closed code, and the build's failure diagnostic names the
// guard (`flow-bootstrap/generation-failure/phase-failure.ts`). The message is
// unchanged and still never travels.

/** Every guard that can refuse to build a model request, one code each. */
export const AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES = Object.freeze([
  /** Evidence a loop gathered, or the draft beside it, carries a key the bound domain denies. */
  "llm.request.evidence_denied_key",
  /** The routing context's observed state carries a key the bound domain denies. */
  "llm.request.routing_denied_key",
  /** The request carries evidence and the domain never declared which keys it denies. */
  "llm.request.denied_keys_undeclared",
  /** The reusable context packet is malformed or over its bound. */
  "llm.request.reusable_context_invalid",
  /** A diagnosis was attached to a task that may not carry one. */
  "llm.request.diagnosis_misplaced",
  /** Failure evidence is malformed, unsafe, unbounded, or attached to the wrong task. */
  "llm.request.failure_evidence_invalid",
  /** Exploration evidence is malformed or attached to the wrong task. */
  "llm.request.exploration_evidence_invalid"
] as const);

export type AutomationStudioLlmRequestRefusalCode = (typeof AUTOMATION_STUDIO_LLM_REQUEST_REFUSAL_CODES)[number];

/**
 * The error a request guard throws.
 *
 * Recognised by `name` and `code` rather than by `instanceof`, so a reader in a
 * directory that must not import this one as a value (the build's failure
 * projection, which `runtime/llm` already imports from) can still name it.
 */
export class AutomationStudioLlmRequestRefusedError extends Error {
  readonly code: AutomationStudioLlmRequestRefusalCode;

  constructor(code: AutomationStudioLlmRequestRefusalCode, message: string) {
    super(message);
    this.name = "AutomationStudioLlmRequestRefusedError";
    this.code = code;
  }
}
