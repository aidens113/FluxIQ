// A run refused before its first step, as the run endpoint answers it: the
// refusal's closed code and what it names, in `payload.diagnostic`, beside the
// sentence a person reads in `error`. Without it a caller -- the Lab's recovery
// matrix, the extension -- could only match the sentence (t402).
//
// The requirement gate (`../../../runtime/service/runtime-session/requirement-gate.ts`)
// throws `AutomationStudioRunRequirementError`, code `run.requirement_missing`,
// carrying the first requirement nothing granted. The runtime barrel does not
// publish the service's session modules, so the error is read by its fields --
// the closed code and a `missing.id` -- rather than by class; anything else
// thrown is not a run refusal and is left to the registry, which answers with
// its message as before.

/** The code a run refused for a missing requirement carries (the gate's own). */
const REQUIREMENT_MISSING = "run.requirement_missing";

/** What the run endpoint answers for a run refused before any step, or `undefined` when `error` is not one. */
export function automationStudioRunRefusalResponse(error: unknown): { ok: false; error: string; payload: { diagnostic: { code: string; missing: string[]; side?: string; plainName?: string } } } | undefined {
  if (!(error instanceof Error) || (error as { code?: unknown }).code !== REQUIREMENT_MISSING) return undefined;
  const missing = (error as { missing?: unknown }).missing;
  if (!missing || typeof missing !== "object") return undefined;
  const { id, side, plainName } = missing as { id?: unknown; side?: unknown; plainName?: unknown };
  if (typeof id !== "string" || !id) return undefined;
  return {
    ok: false,
    error: error.message,
    payload: {
      diagnostic: {
        code: REQUIREMENT_MISSING,
        missing: [id],
        ...(typeof side === "string" ? { side } : {}),
        ...(typeof plainName === "string" ? { plainName } : {})
      }
    }
  };
}
