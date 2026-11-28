// The fields every contributing read holds, where the answer's pages were read with more than one extraction (t1091).
//
// **Why.** The answer joins every result read of one list under its latest state (`../result/output-group.ts`), and two
// of them may read that list with different extractions: different field sets on the same listing. The data layer's
// default identity is the whole stored row (`processAutomationStudioRecordRows`, "the default dedupe key is the whole
// row"), and a listing read on two overlapping pages by two extractions holds different fields under it, so it would be
// kept twice. The lead's rule (t1091 review): duplicates across reads of one list are judged on the fields both reads
// share, or on the asked columns where those are among them, through the data layer's existing dedupe.
//
// So this names the shared fields, and the data stage (`./stage.ts`) and the legacy path (`./feed.ts`) dedupe by them,
// or by the asked columns, where no dedupe was declared and the schemas declare no primary key. Where every page's read holds the same fields, nothing is
// returned and the identity stays the whole row, as before. A page whose read kept no schema cannot say what it holds,
// and nothing is returned then either.
import type { AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";

/** The stored field ids every schema holds, in the first schema's order; `undefined` where they all hold the same fields, one is unknown, or none is shared. */
export function automationStudioAnswerFirstSharedFields(schemas: readonly (AutomationStudioRecordSchema | undefined)[]): string[] | undefined {
  if (!schemas.length || schemas.some((schema) => schema === undefined)) return undefined;
  const held = (schemas as readonly AutomationStudioRecordSchema[]).map((schema) => schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id));
  if (new Set(held.map((ids) => JSON.stringify([...ids].sort()))).size < 2) return undefined;
  const shared = held[0]!.filter((id) => held.every((ids) => ids.includes(id)));
  return shared.length ? shared : undefined;
}
