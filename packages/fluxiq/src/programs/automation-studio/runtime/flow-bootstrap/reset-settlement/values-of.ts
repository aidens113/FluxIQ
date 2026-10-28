// The domain's shown-value tokens as Core takes them in (t772 value witness):
// a start-state read's `values` (place token to value token) and a trial
// step's diff `values` (`{ page, location, replaced }`, the web domain's
// `state-diff/places/diff.ts`). Both are opaque; Core compares them only for
// equality (`./value-witness.ts`, `./value-tracker.ts`). As with a read's
// controls, anything malformed drops the whole answer, never one entry of it:
// a partial map would seed a start, or settle an act, on values the page did
// not report together. These are for the read's caller
// (`../site-reset/start-check.ts`) and the trial's
// (`../../service/candidate-trial/landed-acts.ts`), which keep only the fields
// they parse: a read or a trial act without `values` gives no value witness.

import type { AutomationStudioSiteResetValueWitness } from "./value-tracker.ts";

/** Core's bound on one read's shown values, as on its controls: a read reporting more reports none. */
const MAX_VALUES = 2_000;
/** Core's bound on one step's replaced values (`./value-witness.ts`). */
const MAX_REPLACED = 256;

/** A read's shown values, when every place and value is an opaque token and there are at most `MAX_VALUES` (header); otherwise none. */
export function automationStudioSiteResetValuesOf(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_VALUES) return undefined;
  const values: Record<string, string> = {};
  for (const [place, shown] of entries) {
    if (!token(place) || !token(shown)) return undefined;
    values[place] = shown;
  }
  return values;
}

/**
 * A step diff's replaced values (header), with `location` -- the address the run executed the step at, as its caller reads
 * it -- in place of the diff's own; none where its page or any replacement is malformed, or it replaced none or too many.
 */
export function automationStudioSiteResetValueWitnessOf(value: unknown, location?: string): AutomationStudioSiteResetValueWitness | undefined {
  if (!isRecord(value) || !token(value.page) || !Array.isArray(value.replaced) || !value.replaced.length || value.replaced.length > MAX_REPLACED) return undefined;
  const replaced: Array<AutomationStudioSiteResetValueWitness["replaced"][number]> = [];
  for (const entry of value.replaced as unknown[]) {
    if (!isRecord(entry) || !token(entry.place) || !token(entry.from) || !token(entry.to)) return undefined;
    replaced.push({ place: entry.place, from: entry.from, to: entry.to, ...(entry.newValue === true ? { newValue: true as const } : {}) });
  }
  return { page: value.page, ...(location ? { location } : {}), replaced };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An opaque token, as every token a read carries. */
function token(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,128}$/u.test(value);
}
