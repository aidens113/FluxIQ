// What a provider call threw, when the throw was not one of Core's own.
//
// `normalizedAutomationStudioLlmProviderFailure` answers a throw it cannot
// structurally type with `llm.provider_request_failed`, and until this module it
// answered with nothing else: `run-mun5e1ie-5aeefbbd` died on its first provider
// call as `flow_bootstrap.provider_transport_unknown`, stage `provider_request`,
// invocation and response `unknown`, and the stored record could not say whether
// the socket was reset, the connect timed out, the name did not resolve, or the
// adapter itself had a bug. The throw that said which was in hand and was
// dropped one line later.
//
// **Two halves, in two places, and why.** This half reads the throw: the error's
// class and its own code, its `cause`'s class and code (`ECONNRESET`,
// `UND_ERR_CONNECT_TIMEOUT` -- the part of a `fetch failed` that actually names
// the fault), each held to a code's shape so none can be a sentence, and the
// message as thrown. The message is *not* screened here, and is kept apart from
// the account so nothing can publish it by publishing the account: the screens
// it must pass (`../harness/evidence-screen.ts`, `../harness/locator-text.ts`) live in
// the harness, and reaching them from this module -- which `provider-contract.ts`
// imports -- closes a module cycle through the harness barrel that leaves the
// DeepSeek adapter's own locator screen undefined at run time. So the harness
// screens it (`../harness/throw-screen.ts`) on the one path that publishes it, the
// way `responseBody` stays on the throw until an adapter has screened it.

/** Why part of a throw was not carried, one word per reason. */
export type AutomationStudioLlmProviderThrowWithheld =
  | "message_credential_shaped"
  | "message_url_query_shaped"
  | "message_payload_shaped"
  | "message_locator_shaped"
  | "message_truncated"
  | "throw_unreadable";

/**
 * A bounded, screened account of an untyped provider throw, as a stored Flow
 * Bootstrap failure publishes it. Every field is optional because a throw may
 * carry any of them or none; a throw that yields none produces no record.
 */
export type AutomationStudioLlmProviderThrow = {
  /** `error.name`, or the constructor's name when that is not code-shaped. */
  errorClass?: string;
  /** `error.code`, as Node system errors carry it. */
  errorCode?: string;
  /** The same two things for `error.cause`, which is where `fetch failed` keeps the real fault. */
  causeClass?: string;
  causeCode?: string;
  /** The error's message, and its cause's when different, screened and cut to `AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS.messageLength`. */
  message?: string;
  /** Every omission, in the order it was made. Absent when nothing was withheld. */
  withheld?: AutomationStudioLlmProviderThrowWithheld[];
};

/**
 * A throw as read, before its message is screened.
 *
 * `account` is publishable as it stands: codes and closed words only.
 * `unscreenedMessage` is not, and nothing may publish it except through
 * `../harness/throw-screen.ts`.
 */
export type AutomationStudioLlmProviderThrowRead = {
  account: Omit<AutomationStudioLlmProviderThrow, "message">;
  unscreenedMessage?: string;
};

/** The bounds a published throw is held to, written out again by the flow-bootstrap reader. */
export const AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS = Object.freeze({
  messageLength: 240,
  /** How much of a thrown message is held for screening; the screens see all of it before it is cut. */
  unscreenedMessageLength: 4_000
});

const CODE_SHAPE = /^[A-Za-z0-9_.:-]{1,100}$/u;

/**
 * The throw as read, or `undefined` when it offers nothing to account for (a
 * thrown `undefined`, an empty object).
 *
 * Never throws: it is called from inside a `catch`, and a value that fights
 * being read -- a throwing getter, a revoked proxy -- is recorded as exactly
 * that rather than replacing the failure being reported.
 */
export function automationStudioLlmProviderThrowRead(error: unknown): AutomationStudioLlmProviderThrowRead | undefined {
  try {
    return readOf(error);
  } catch {
    return { account: { withheld: ["throw_unreadable"] } };
  }
}

function readOf(error: unknown): AutomationStudioLlmProviderThrowRead | undefined {
  if (typeof error === "string") {
    const unscreenedMessage = joinedMessage([error]);
    return { account: { errorClass: "string" }, ...(unscreenedMessage ? { unscreenedMessage } : {}) };
  }
  if (!error || typeof error !== "object") return undefined;
  const record = error as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const cause = record.cause && typeof record.cause === "object" ? record.cause as { name?: unknown; code?: unknown; message?: unknown } : undefined;
  const errorClass = classOf(error, record.name);
  const errorCode = codeOf(record.code);
  const causeClass = cause ? classOf(cause, cause.name) : undefined;
  const causeCode = cause ? codeOf(cause.code) : undefined;
  const unscreenedMessage = joinedMessage([record.message, cause?.message]);
  const account = {
    ...(errorClass ? { errorClass } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(causeClass ? { causeClass } : {}),
    ...(causeCode ? { causeCode } : {})
  };
  if (!Object.keys(account).length && !unscreenedMessage) return undefined;
  return { account, ...(unscreenedMessage ? { unscreenedMessage } : {}) };
}

/** A class name that says something: a plain object's `Object` does not. */
function classOf(value: object, name: unknown): string | undefined {
  if (typeof name === "string" && CODE_SHAPE.test(name)) return name;
  const constructorName = (value as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof constructorName === "string" && constructorName !== "Object" && CODE_SHAPE.test(constructorName) ? constructorName : undefined;
}

function codeOf(code: unknown): string | undefined {
  const written = typeof code === "number" && Number.isFinite(code) ? String(code) : code;
  return typeof written === "string" && CODE_SHAPE.test(written) ? written : undefined;
}

/** The error's message and its cause's, when that says something new, on one line. */
function joinedMessage(parts: unknown[]): string | undefined {
  const texts = parts.filter((part): part is string => typeof part === "string").map((part) => part.replace(/\s+/gu, " ").trim()).filter(Boolean);
  const [first, second] = texts;
  if (first === undefined) return undefined;
  const text = second !== undefined && !first.includes(second) ? `${first} (cause: ${second})` : first;
  return text.slice(0, AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS.unscreenedMessageLength);
}
