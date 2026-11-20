// Whether Anthropic refused a request because it is larger than the model's window (t965).
//
// Live run `run-mwodpw10-3d5748ab`, judge 0117: a request Core measured as fitting was counted past the window by
// Anthropic, which answered HTTP 400 `invalid_request_error`, and Core read it as a server error and the check as
// not judged, three times. Anthropic says so in the error's message ("prompt is too long", or input and requested
// output past the context limit). Read here only from the refusal's screened fields, never from the request.

/** The refusal's error fields as the transport screened them. */
type RefusalError = { type?: unknown; message?: unknown } | null | undefined;

const TOO_LONG = /prompt is too long|too many (?:input )?tokens|exceeds? (?:the )?(?:model'?s? )?(?:maximum )?context(?: window| length| limit)?|context (?:window|length|limit) (?:of|exceeded)/iu;

export function automationStudioAnthropicRefusedForSize(status: number, error: RefusalError): boolean {
  if (status !== 400 && status !== 413) return false;
  if (status === 413) return true;
  return typeof error?.message === "string" && TOO_LONG.test(error.message);
}
