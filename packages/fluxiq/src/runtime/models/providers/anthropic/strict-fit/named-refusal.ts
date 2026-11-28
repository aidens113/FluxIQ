// Which strict tool a refusal names, where Anthropic refused a request for one tool's schema (t1100).
//
// The web panel's replay on 2026-11-28 (fluxiq 0.55.0, Haiku 5.5) sent `core_set_result_processing` strict, its
// `input.process` an object left open (`{"type": ["object", "null"]}`), and every decision after the judge was answered in
// under 200 ms with HTTP 400 `invalid_request_error` "tools.8.custom: For 'object' type, 'additionalProperties' must be
// explicitly set to false". The platform names the tool by its place in the request's `tools` (`tools.N`). Where that
// tool was sent strict, it is the one to send non-strict (`./demote.ts`): its schema as offered goes out unchanged and is
// still checked on the way back. A refusal that names no tool, or a tool sent non-strict, names nothing here, and stands.
// Read only from the refusal's screened fields (`../messages.ts`) and the request as sent, never from anything else.

/** The refusal's error fields as the transport screened them. */
type RefusalError = { type?: unknown; message?: unknown } | null | undefined;
/** A tool as the refused request sent it. */
type Sent = { readonly name?: unknown; readonly strict?: unknown };

/** `tools.N` at the head of the platform's sentence: the tool's place in the request's `tools`. */
const NAMED_TOOL = /^tools\.(\d{1,4})(?:\.|:|\s|$)/u;

/** The name of the strict tool `sent` held that the 400 `error` names, or `undefined` where it names none sent strict. */
export function automationStudioAnthropicStrictToolNamedByRefusal(status: number | undefined, error: RefusalError, sent: readonly Sent[]): string | undefined {
  if (status !== 400 || typeof error?.message !== "string") return undefined;
  const index = NAMED_TOOL.exec(error.message.trim())?.[1];
  const tool = index === undefined ? undefined : sent[Number(index)];
  return tool?.strict === true && typeof tool.name === "string" ? tool.name : undefined;
}
