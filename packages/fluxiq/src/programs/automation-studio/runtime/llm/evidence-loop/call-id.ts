// The id an evidence entry is filed under, when the model's own is already
// taken.
//
// The ids are the model's bookkeeping and the evidence only needs them to be
// distinct, so a clash is resolved rather than ended on: a reused id used to
// fail the whole loop as `duplicate_call`.

/**
 * The requested call id when it is unused, otherwise the first of `<id>.2`,
 * `<id>.3`, ... that is, cut to keep within the 200-character id bound. The
 * suffix is digits and a dot, so the id stays one the provider schema accepts.
 */
export function automationStudioLlmEvidenceUnusedCallId(used: ReadonlySet<string>, requested: string): string {
  if (!used.has(requested)) return requested;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `.${suffix}`;
    const candidate = `${requested.slice(0, 200 - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** What every opening call id starts with: the loop's free first look (`../evidence-loop.ts`). */
const OPENING_PREFIX = "initial.";

/** A call scope: what the provider's call id pattern accepts, without a dot, short enough that the id stays well inside its bound. */
const CALL_SCOPE = /^[A-Za-z0-9_-]{1,40}$/u;

/**
 * The opening call's id, and whether an id is one (t537). Without a scope the
 * id is byte-identical to what it always was, `initial.<toolId>`, because the
 * domain keys per-build memory on it. A loop run beside others for one Flow --
 * a subflow builder, under its brief -- passes a scope, and its opening is
 * `initial.<toolId>.<scope>`, so two such loops never share that memory. Every
 * reader that asks whether a call is the opening one asks by the prefix, which
 * a scoped id keeps.
 */
export function automationStudioLlmEvidenceOpeningCallId(toolId: string, scope?: string): string {
  if (scope === undefined) return `${OPENING_PREFIX}${toolId}`;
  if (!CALL_SCOPE.test(scope)) throw new Error("llm_evidence_loop.call_scope_invalid");
  return `${OPENING_PREFIX}${toolId}.${scope}`;
}

/** Whether a call id is a loop's opening call, scoped or not. */
export function automationStudioLlmEvidenceIsOpeningCallId(callId: string): boolean {
  return callId.startsWith(OPENING_PREFIX);
}
