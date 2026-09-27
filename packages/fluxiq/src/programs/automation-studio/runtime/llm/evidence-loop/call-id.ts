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
