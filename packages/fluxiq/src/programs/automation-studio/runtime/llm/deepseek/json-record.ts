/**
 * Whether an untrusted value is a JSON object rather than an array or a scalar.
 *
 * The harness has the same predicate in `harness/json-bounds.ts` and keeps it
 * unexported on purpose -- `harness/index.ts` names it an internal -- so this
 * is the adapter's own, shared by the three modules here that read JSON nobody
 * here wrote: the pre-flight check over the request's context, the response
 * envelope, and the refusal reader over a provider's error body.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
