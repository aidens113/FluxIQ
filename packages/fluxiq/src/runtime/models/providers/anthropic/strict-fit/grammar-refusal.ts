// Whether Anthropic refused a request because the grammar its strict schemas compile into is too large (t1093).
//
// The structured-outputs page counts three limits (20 strict tools, 24 optional parameters, 16 union-typed
// parameters) and then, under "Additional internal limits", one it gives no number: "there are additional internal
// limits on the compiled grammar size ... When these limits are exceeded, you'll receive a 400 error with the message
// 'Schema is too complex for compilation.'" The live API words it otherwise. The web panel's first decision on
// 2026-11-27 (12 tools, 8 of them strict, every count within the limits) was answered in 177 ms with HTTP 400 "The
// compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number
// of strict tools.", and t1087's strict judge answer met the same words. Both wordings are read; nothing else is.
// Read only from the refusal's screened fields (`../messages.ts`), never from the request.

/** The refusal's error fields as the transport screened them. */
type RefusalError = { type?: unknown; message?: unknown } | null | undefined;

const GRAMMAR_TOO_LARGE = /compiled grammar is too large|schema is too complex for compilation|reduce the number of strict tools/iu;

/** True where `status` and the screened `error` say the strict schemas' compiled grammar is past the platform's limit. */
export function automationStudioAnthropicRefusedForGrammar(status: number | undefined, error: RefusalError): boolean {
  return status === 400 && typeof error?.message === "string" && GRAMMAR_TOO_LARGE.test(error.message);
}
