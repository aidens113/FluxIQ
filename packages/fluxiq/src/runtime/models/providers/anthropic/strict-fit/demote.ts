// One strict tool demoted after the platform refused a request for its compiled grammar (t1093), or for one strict tool's
// schema, which the refusal names (`./named-refusal.ts`, t1100): that tool is the one demoted.
//
// **The platform's refusal, answered by changing the request.** The grammar limit has no number
// (`./grammar-refusal.ts`), so no count Core keeps can promise a strict set fits; only the platform can say. Each
// refusal turns one more strict tool non-strict and the request is sent again (`../../../../llm/anthropic/provider.ts`),
// until the platform accepts it or no strict tool is left, when the refusal stands and is said with the platform's own
// words. It ends by itself: an offer has finitely many strict tools, and each pass removes one. A refusal is free: it
// comes before any token is sampled.
//
// **Which tool.** The one whose schema, as sent, is largest: the grammar is compiled from the schemas, so the largest
// costs it most, measured by the schema's own size and never by a fixed count. Ties go by name, so the order is the
// same on every run. `complete` -- the call that hands back the task's result -- keeps its strictness longest: it is
// the call whose input is the answer, so it goes last of all.
//
// **Still checked.** A tool sent non-strict is read back and held to its unchanged original schema, exactly as before
// (`../../../../llm/anthropic/task-answer.ts`): only the sampling guarantee is given up, never the check.

import { AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS } from "./held-fits.ts";
import { automationStudioAnthropicToolsDigest } from "./tools-digest.ts";

/** A tool as it was offered; `variant.kind` names a decision tool's kind (`../../../../llm/provider-task/decision-tools/`). */
type Offered = { readonly name: string; readonly description: string; readonly inputSchema: Record<string, unknown>; readonly variant?: { readonly kind?: unknown } };
/** A tool as the refused request sent it. */
type Sent = { readonly name?: unknown; readonly input_schema?: unknown; readonly strict?: unknown };

/** The decision kind that keeps strictness longest. */
const KEPT_LONGEST = "complete";

/**
 * Demotes the costliest strict tool `sent` held, for the offer `offered`, and names it; `undefined` where `sent` held no
 * strict tool, and the refusal stands. The offer is held to the rest of `sent`'s strict tools, within what it already
 * held (`./held-fits.ts`), so a second request of the same offer refused at once names the same tool and demotes no
 * other: it is then sent again as the memory now builds it.
 */
export function automationStudioAnthropicDemoteStrictTool(offered: readonly Offered[], sent: readonly Sent[], named?: string): string | undefined {
  const keptLongest = new Set(offered.filter((tool) => tool.variant === undefined ? tool.name === KEPT_LONGEST : tool.variant.kind === KEPT_LONGEST).map((tool) => tool.name));
  // A refusal that named a strict tool's schema (`./named-refusal.ts`, t1100) demotes that tool first, whatever its size.
  const first = (name: string) => Number(name !== named);
  const strict = sent
    .filter((tool): tool is Sent & { name: string } => tool.strict === true && typeof tool.name === "string")
    .map((tool) => ({ name: tool.name, last: keptLongest.has(tool.name), cost: Buffer.byteLength(JSON.stringify(tool.input_schema ?? null), "utf8") }))
    .sort((a, b) => first(a.name) - first(b.name) || Number(a.last) - Number(b.last) || b.cost - a.cost || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // A named tool the refused request did not send strict is no tool to demote: the refusal stands.
  if (named !== undefined && strict[0]?.name !== named) return undefined;
  const next = strict[0]?.name;
  // The offer is held to what the refused request sent strict, less this one: no tool it sent non-strict turns strict.
  if (next !== undefined) AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS.narrow(automationStudioAnthropicToolsDigest(offered), strict.slice(1).map((tool) => tool.name));
  return next;
}
