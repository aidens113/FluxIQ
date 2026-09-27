// Everything Core knows about DeepSeek in one place: which models it will send
// to, what a call to one costs, and the adapter that makes the call.
//
// These were three sibling files under `runtime/llm/` sharing a `deepseek-`
// prefix, which is the structure audit's own signal that the prefix wanted to
// be a directory.
//
// `provider.ts` was then the whole adapter -- the pre-flight checks, the prompt,
// the outbound body, the reply parser and the call itself, 811 lines of it, past
// the file limit. It is now the call and nothing else, and each responsibility it
// held has its own module beside it: what the model is told (`system-prompt.ts`),
// the shape it must answer in (`output-schema.ts`), what goes on the wire
// (`request-body.ts`), what may be said about that without quoting it
// (`request-shape.ts`), what the request must satisfy before it is sent
// (`preflight.ts`), what came back (`response-envelope.ts`), how much of it is
// read (`bounded-read.ts`), and what a refusal says (`refusal.ts`).
//
// The export list below is what it was before the split, plus the refusal
// record: nothing outside this directory imports anything but this barrel.
export * from "./models.ts";
export * from "./pricing.ts";
export {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES
} from "./bounded-read.ts";
export { estimateAutomationStudioDeepSeekInputTokens } from "./request-body.ts";
export {
  AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL,
  AUTOMATION_STUDIO_DEEPSEEK_MODEL,
  AUTOMATION_STUDIO_DEEPSEEK_ORIGIN,
  createAutomationStudioDeepSeekProvider,
  type AutomationStudioDeepSeekProviderOptions,
  type AutomationStudioLlmSecretReference
} from "./provider.ts";
// What a provider said when it refused a request: see `refusal.ts` for what it
// carries and what it screens.
//
// **Where it goes, corrected.** It used to ride on the thrown failure's
// `responseBody` and reach nobody. It is still carried there -- one JSON string,
// this adapter's own encoding -- but that slot is now a seam rather than a dead
// end: `normalizedAutomationStudioLlmProviderFailure` reads it into the
// provider-neutral `AutomationStudioLlmProviderRefusal` (`../refusal-record.ts`),
// which re-checks every bound; the harness puts that on its result as
// `providerRefusal`; and the Flow Bootstrap projection writes it into the stored
// failure's `accounting.providerRefusal`, which the caller of a failed build is
// answered with. So it *is* published, deliberately: a refusal nobody can read
// is a 400 with no reason, which is what two live runs left behind. Every field
// in it is screened here, against the configured credential and Core's locator
// screen, and bounded again centrally -- and the typed parameter on
// `AutomationStudioLlmProviderError` is where a record should be passed when
// this file is next edited.
export {
  AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_FIELD_MAX_LENGTH,
  AUTOMATION_STUDIO_DEEPSEEK_REFUSAL_MESSAGE_MAX_LENGTH,
  automationStudioDeepSeekRefusalText,
  readAutomationStudioDeepSeekRefusal,
  type AutomationStudioDeepSeekRefusal,
  type AutomationStudioDeepSeekRefusalWithheld
} from "./refusal.ts";
export { automationStudioDeepSeekRequestShape, type AutomationStudioDeepSeekRequestShape } from "./request-shape.ts";
