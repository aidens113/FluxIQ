// The id an evidence entry is filed under, when the model's own is already
// taken.
//
// The ids are the model's bookkeeping and the evidence only needs them to be
// distinct, so a clash is resolved rather than ended on: a reused id used to
// fail the whole loop as `duplicate_call`.

/** What every opening call id starts with: the loop's free first look (`../evidence-loop.ts`). */
const OPENING_PREFIX = "initial.";

/**
 * What a model-written id that starts like an opening call's is filed under
 * instead: the opening prefix is Core's alone (t648). A domain reads keys Core
 * sets only on its own opening call (`held`, `arrived`, `repairs`), recognised
 * by that prefix, so a call the model wrote must never carry it, whether or not
 * this loop's own opening is scoped.
 */
const MODEL_PREFIX = "model.";

/**
 * The requested call id when it is unused, otherwise the first of `<id>.2`,
 * `<id>.3`, ... that is, cut to keep within the 200-character id bound. The
 * suffix is digits and a dot, so the id stays one the provider schema accepts.
 * A requested id with the opening prefix is first moved under `model.` (header
 * of `MODEL_PREFIX`), so no id this returns is an opening call's.
 */
export function automationStudioLlmEvidenceUnusedCallId(used: ReadonlySet<string>, requested: string): string {
  const own = requested.startsWith(OPENING_PREFIX) ? `${MODEL_PREFIX}${requested}`.slice(0, 200) : requested;
  if (!used.has(own)) return own;
  for (let suffix = 2; ; suffix += 1) {
    const tail = `.${suffix}`;
    const candidate = `${own.slice(0, 200 - tail.length)}${tail}`;
    if (!used.has(candidate)) return candidate;
  }
}

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
