// Whether a judge's call came back with a reply that arrived and could not be read, and what could not be read, in the
// words a decision loop already tells its model (`../../models/failures/unreadable-reply.ts`, `CASE_SAID`).
//
// **Which failures.** Every error the call ended with is one of the provider's codes for a reply that arrived and could
// not be read (`UNREADABLE_REPLY_CODES`: malformed, cut off, oversize, not the object asked for), or a finding in
// `llm_output.`, the harness's own namespace for a reply that arrived and did not pass Core's checks. A timeout, a
// network fault, a rate limit, a refused key, a purse's refusal and a cancellation are not: nothing arrived to be read,
// or asking again cannot change the answer.
//
// Codes and the closed case list only: never a word of the reply.

import { automationStudioLlmProviderReplyAccount, automationStudioLlmReplyUnreadable, automationStudioLlmUnreadableReplySaid } from "../../models/failures/index.ts";

/** The harness's namespace for a reply that arrived and did not pass Core's checks. */
const OUTPUT_FINDING = "llm_output.";

/**
 * What could not be read of a failed call's reply, as a clause, where every error it ended with says its reply arrived
 * and could not be read; nothing for any other failure.
 */
export function automationStudioResultUnreadableReplySaid(diagnostics: readonly { severity: string; code: string; metadata?: unknown }[]): string | undefined {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length === 0) return undefined;
  const provider = errors.filter((diagnostic) => !diagnostic.code.startsWith(OUTPUT_FINDING)).map((diagnostic) => diagnostic.code);
  if (provider.length > 0 && !automationStudioLlmReplyUnreadable(provider)) return undefined;
  // A reply Core's checks refused was JSON that did not fit the answer asked for.
  if (provider.length === 0) return automationStudioLlmUnreadableReplySaid({ case: "content_off_shape" });
  const reply = errors.map((diagnostic) => providerReply(diagnostic.metadata)).find((account) => account !== undefined);
  const said = automationStudioLlmUnreadableReplySaid({ case: reply?.case, issueCodes: provider });
  // Where the reply parts from the schema, by path and rule (t1000): "it did not fit" alone left the next reply nothing to
  // change, and a scripted judge missing one required field was asked again 2,399 times in 90 s (t994, W1). The account
  // carries only schema keys and schema rules, bounded where it was read (`automationStudioLlmProviderReplyAccount`).
  const misses = reply?.misses ?? [];
  return misses.length === 0 ? said : `${said}: ${misses.map((miss) => `${miss.path} ${miss.rule}`).join("; ")}`;
}

/** The reply account the harness carries on a provider failure's diagnostic (`../../llm/harness/run.ts`, `providerReply`). */
function providerReply(metadata: unknown): ReturnType<typeof automationStudioLlmProviderReplyAccount> {
  return metadata && typeof metadata === "object" ? automationStudioLlmProviderReplyAccount((metadata as { providerReply?: unknown }).providerReply) : undefined;
}
