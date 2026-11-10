import type { ProgramEndpointAssistant } from "./types.ts";

/**
 * What a call commits to spend in US dollars, from its declaration's
 * `spends` on its input as the input parses it; undefined when the endpoint
 * declares no spend. An input that does not parse, or a `spends` that gives
 * no amount of zero or more, is read as more than any allowance, so the
 * assistant asks first rather than guess (the call itself is then refused or
 * run as its handler decides). The assistant no longer reads spend from a
 * field's name (review P9-R2, S2).
 */
export function assistantCallSpend(assistant: ProgramEndpointAssistant | undefined, input: unknown): number | undefined {
  if (assistant === undefined || "hidden" in assistant || assistant.spends === undefined) return undefined;
  const read = assistant.input.read(input);
  if (!read.ok) return Number.POSITIVE_INFINITY;
  const usd = assistant.spends(read.value);
  return typeof usd === "number" && Number.isFinite(usd) && usd >= 0 ? usd : Number.POSITIVE_INFINITY;
}
