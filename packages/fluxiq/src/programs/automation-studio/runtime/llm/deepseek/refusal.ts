import { automationStudioWithoutLocators } from "../harness.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import { readAutomationStudioDeepSeekBoundedResponse } from "./bounded-read.ts";
import { isRecord } from "./json-record.ts";
import type { AutomationStudioDeepSeekRequestShape } from "./request-shape.ts";

/** How much of the provider's own sentence is kept. Long enough to name a field, short enough not to be a payload. */
export const AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH = 400;
/**
 * How long an error *field* may be, and what it may contain.
 *
 * `code`, `type` and `param` are names, not prose: `invalid_request_error`,
 * `max_tokens`, `messages[1].content`. An allow-list is strictly stronger here
 * than the locator screen used on the message -- it admits the field path that
 * makes a 400 actionable while refusing every shape that addresses an element,
 * because those need a quote, an equals sign, a slash or a sigil, and none of
 * those is admitted.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_FIELD_MAX_LENGTH = 120;
const REFUSAL_FIELD_SHAPE = /^[\w.:\-[\]]{1,120}$/u;

/** Everything a refusal record deliberately does not carry, each with its reason. */
export type AutomationStudioDeepSeekRefusalWithheld =
  | "body_unreadable"
  | "body_over_limit"
  | "body_empty"
  | "body_not_json"
  | "error_object_absent"
  | "error_fields_unnamed"
  | "message_truncated"
  | "message_locator_shaped"
  | "message_credential_shaped";

/**
 * What a provider said when it refused a request, and the shape of the request
 * it refused.
 *
 * A 4xx is a client error -- the request was wrong -- and the body the provider
 * sends back is the only thing that says how. Two live runs died on their first
 * call with a status and nothing else (`run-muhs8hx3-6fd929e6`,
 * `run-muhtuizo-c458e49c`), and the adapter threw one line after the answer was
 * in hand. This is that answer, read and screened.
 *
 * **What is screened, and how.** The provider's `message` is prose it wrote,
 * and a 400 often quotes the field it objected to -- which means it can quote a
 * page's text back. It is therefore bounded, run through the same locator
 * screen the rest of this program applies to free text on its way to a model
 * (`harness/locator-text.ts`), and dropped whole if the configured credential
 * appears anywhere in it. `code`, `type` and `param` must be plain identifiers.
 * Everything else about the refusal is a count, a status, or an id this
 * repository minted (`request`, see `request-shape.ts`).
 *
 * **Nothing is dropped silently.** Every omission appears in `withheld` with
 * the reason for it, so a reader can tell "the provider said nothing" from "the
 * provider said something this record would not carry" -- the same distinction
 * the rest of the program's evidence screens keep.
 */
export type AutomationStudioDeepSeekRefusal = {
  /** The status the provider answered with. Always known: it is why this record exists. */
  status: number;
  /** The media type the provider declared, or `null` when it declared none. */
  contentType: string | null;
  /** How many bytes of body arrived, or `null` when none could be read. */
  bodyBytes: number | null;
  /** The provider's own error, read out of a JSON body field by field -- never the body itself. */
  error: {
    code: string | null;
    type: string | null;
    param: string | null;
    message: string | null;
  } | null;
  withheld: readonly AutomationStudioDeepSeekRefusalWithheld[];
  request: AutomationStudioDeepSeekRequestShape;
};

/**
 * Read the refusal the provider just sent, without letting the read fail the call.
 *
 * The status and the request's shape are already known, so a body that cannot
 * be read must not replace them: the read's own failure becomes a named entry
 * in `withheld` and the record is returned regardless.
 */
export async function readAutomationStudioDeepSeekRefusal(input: {
  response: Response;
  maxResponseBytes: number;
  request: AutomationStudioDeepSeekRequestShape;
  /** The credential the request was sent with, so a provider echoing it cannot carry it here. */
  credential?: string;
}): Promise<AutomationStudioDeepSeekRefusal> {
  const withheld: AutomationStudioDeepSeekRefusalWithheld[] = [];
  const contentType = input.response.headers.get("content-type");
  const read = await readRefusalBytes(input.response, input.maxResponseBytes);
  if ("withheld" in read) {
    withheld.push(read.withheld);
    return { status: input.response.status, contentType, bodyBytes: null, error: null, withheld, request: input.request };
  }
  const text = new TextDecoder("utf-8").decode(read.bytes);
  const base = { status: input.response.status, contentType, bodyBytes: read.bytes.byteLength, request: input.request };
  if (text.trim() === "") {
    withheld.push("body_empty");
    return { ...base, error: null, withheld };
  }
  const parsed = parsedJson(text);
  if ("withheld" in parsed) {
    withheld.push(parsed.withheld);
    return { ...base, error: null, withheld };
  }
  const named = namedErrorObject(parsed.value);
  if (!named) {
    withheld.push("error_object_absent");
    return { ...base, error: null, withheld };
  }
  return {
    ...base,
    error: {
      code: refusalField(named.code, withheld),
      type: refusalField(named.type, withheld),
      param: refusalField(named.param, withheld),
      message: refusalMessage(named.message, input.credential, withheld)
    },
    withheld
  };
}

/** The refusal as the one string a caller can carry beside a failure. */
export function automationStudioDeepSeekRefusalText(refusal: AutomationStudioDeepSeekRefusal): string {
  return JSON.stringify(refusal);
}

async function readRefusalBytes(
  response: Response,
  maxResponseBytes: number
): Promise<{ bytes: Uint8Array } | { withheld: "body_unreadable" | "body_over_limit" }> {
  try {
    return { bytes: await readAutomationStudioDeepSeekBoundedResponse(response, maxResponseBytes) };
  } catch (error) {
    // Named rather than thrown, and named rather than dropped: a reply too
    // large to hold is a different fact from a reply that could not be read,
    // and neither may become the failure the caller reports -- the status the
    // provider answered with is already known and is the more specific answer.
    const oversize = error instanceof AutomationStudioLlmProviderError && error.code === "llm.provider_response_oversize";
    return { withheld: oversize ? "body_over_limit" : "body_unreadable" };
  }
}

/**
 * The body as JSON, or the statement that it is not JSON.
 *
 * A body that will not parse is a *fact about the body*, not an absence: there
 * is no named field to read and the whole thing is prose from something that may
 * not even be the provider -- an interposed proxy's error page is the usual case.
 * So the failure becomes a named answer rather than `undefined`, which a caller
 * could not tell from a body that parsed to nothing. The status, the declared
 * media type and the size are then all this record claims.
 */
function parsedJson(text: string): { value: unknown } | { withheld: "body_not_json" } {
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { withheld: "body_not_json" };
  }
}

/**
 * The error object in a refusal body.
 *
 * `{ "error": { "message": ..., "type": ..., "param": ..., "code": ... } }` is
 * the shape DeepSeek and every OpenAI-compatible endpoint uses; a gateway in
 * front of one sometimes flattens it to the top level. Either is read, and a
 * body naming none of the four fields is reported as naming no error rather
 * than as an empty one.
 */
function namedErrorObject(parsed: unknown): Record<string, unknown> | undefined {
  const candidates = [isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined, isRecord(parsed) ? parsed : undefined];
  return candidates.find((candidate) => candidate !== undefined
    && ["message", "code", "type", "param"].some((key) => candidate[key] !== undefined && candidate[key] !== null));
}

function refusalField(value: unknown, withheld: AutomationStudioDeepSeekRefusalWithheld[]): string | null {
  if (value === undefined || value === null) return null;
  const written = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof written !== "string" || !REFUSAL_FIELD_SHAPE.test(written)) {
    if (!withheld.includes("error_fields_unnamed")) withheld.push("error_fields_unnamed");
    return null;
  }
  return written;
}

function refusalMessage(value: unknown, credential: string | undefined, withheld: AutomationStudioDeepSeekRefusalWithheld[]): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    if (value !== undefined && value !== null && !withheld.includes("error_fields_unnamed")) withheld.push("error_fields_unnamed");
    return null;
  }
  if (credential && credential.trim() !== "" && value.includes(credential)) {
    withheld.push("message_credential_shaped");
    return null;
  }
  const screened = automationStudioWithoutLocators(value);
  if (screened !== value) withheld.push("message_locator_shaped");
  if (screened.length <= AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH) return screened;
  withheld.push("message_truncated");
  return screened.slice(0, AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH);
}
