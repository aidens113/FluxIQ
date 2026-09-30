// The screen an untyped provider throw passes before anything publishes it.
//
// `../throw-account/` reads the throw and keeps its message apart, unscreened;
// this is where the message is screened, beside the screens it reuses, and the
// one place a published account of a throw is made.
//
// **What is screened, and how.** The message is prose from something that is not
// Core. It is dropped whole if Core's credential screen (`evidence-screen.ts`)
// finds a credential shape in it, or if it names an authorization header, a key,
// a cookie or a password at all, or carries a URL with a query string, or looks
// like a JSON payload; otherwise it goes through the locator screen the
// provider-refusal message uses (`locator-text.ts`) and is cut to a bound. The
// screens run on the whole text before it is cut, so a credential past the bound
// still drops the sentence rather than being cut out of view. Every omission is
// named in `withheld`, so a record that says nothing can be told from one that
// would not say it -- the rule the refusal record keeps.
import {
  AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS,
  type AutomationStudioLlmProviderThrow,
  type AutomationStudioLlmProviderThrowRead,
  type AutomationStudioLlmProviderThrowWithheld
} from "../throw-account/index.ts";
import { screenAutomationStudioLlmEvidence } from "./evidence-screen.ts";
import { automationStudioWithoutLocators } from "./locator-text.ts";

/**
 * What no carried message may mention, even where the credential screen finds
 * no credential shape: a header name or scheme is enough, because what follows
 * it in a transport error is the value. Wider than the evidence screen on
 * purpose -- page text never reaches here, so a false positive costs one
 * sentence and never a build.
 */
const HEADER_SHAPED = /\b(?:authorization|bearer|api[-_ ]?key|x-api-key|set-cookie|cookie|password|passwd|secret)\b|\bsk-[A-Za-z0-9_-]{6,}/iu;
const URL_QUERY_SHAPED = /\b[a-z][a-z0-9+.-]*:\/\/\S*[?#]/iu;
const PAYLOAD_SHAPED = /[{[]\s*"/u;

/** The publishable account of a throw as read, or `undefined` when it says nothing. */
export function automationStudioLlmScreenedProviderThrow(read: AutomationStudioLlmProviderThrowRead): AutomationStudioLlmProviderThrow | undefined {
  const withheld: AutomationStudioLlmProviderThrowWithheld[] = [...read.account.withheld ?? []];
  const message = read.unscreenedMessage === undefined ? undefined : screenedMessage(read.unscreenedMessage, withheld);
  const { withheld: _read, ...codes } = read.account;
  void _read;
  const account: AutomationStudioLlmProviderThrow = {
    ...codes,
    ...(message ? { message } : {}),
    ...(withheld.length ? { withheld } : {})
  };
  return Object.keys(account).length ? account : undefined;
}

function screenedMessage(text: string, withheld: AutomationStudioLlmProviderThrowWithheld[]): string | undefined {
  if (screenAutomationStudioLlmEvidence(text, []).secretShaped || HEADER_SHAPED.test(text)) {
    withheld.push("message_credential_shaped");
    return undefined;
  }
  if (URL_QUERY_SHAPED.test(text)) {
    withheld.push("message_url_query_shaped");
    return undefined;
  }
  if (PAYLOAD_SHAPED.test(text)) {
    withheld.push("message_payload_shaped");
    return undefined;
  }
  const screened = automationStudioWithoutLocators(text);
  if (screened !== text) withheld.push("message_locator_shaped");
  const limit = AUTOMATION_STUDIO_LLM_PROVIDER_THROW_LIMITS.messageLength;
  if (screened.length <= limit) return screened;
  withheld.push("message_truncated");
  return screened.slice(0, limit).trimEnd();
}
