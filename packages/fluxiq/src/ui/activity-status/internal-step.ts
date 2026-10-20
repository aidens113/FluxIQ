// Which activity events are steps a person should see. Only what the model
// decided and what really happened on the page (or to the automation) is a
// step. Core's own bookkeeping is not: the page captures it takes to tell
// whether a step changed anything (state digests), the check it runs before
// answering a repeated look from memory, and the internal tools the build loop
// calls on itself (budget, history, request and decision checks, reading its
// own draft). Shown as rows, these made the chat say "Looking at the page"
// five times before FluxIQ had done anything
// (docs/working/language-driven-flow-loop-plan/reports/looking-at-page-repeat.md).
// Shared, because the background leaves them out of the history it keeps for
// the chat (`background/activity/unit-history.ts`) and the chat leaves them
// out of its step messages. No DOM.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

type ActivityDetail = NonNullable<ClientGatewayActivity["detail"]>;

/** Core's internal tool ids: the loop's own checks and records, never a decision or a page action. */
const INTERNAL_TOOLS: ReadonlySet<string> = new Set([
  "core.amendment_check",
  "core.answer_check",
  "core.budget",
  "core.decision_check",
  "core.evidence_history",
  "core.no_progress",
  "core.observe",
  "core.other",
  "core.read_draft",
  "core.request_check",
  "core.resumed",
  "core.state_digest"
]);

/** Words that mark an internal read wherever they appear in an id or a title. */
const INTERNAL_WORDS = /\b(?:state[ _-]?digest|digest|answer[ _-]?check|bookkeeping)\b/iu;

/** True when `detail` is Core's bookkeeping rather than a step the person would recognise. */
export function isInternalStep(detail: ActivityDetail): boolean {
  const ref = detail.ref?.trim().toLowerCase() ?? "";
  if (INTERNAL_TOOLS.has(ref) || INTERNAL_WORDS.test(ref)) return true;
  const named = /^using\s+([a-z0-9_.-]+)/iu.exec(detail.title.trim())?.[1]?.toLowerCase();
  if (named !== undefined && INTERNAL_TOOLS.has(named)) return true;
  return INTERNAL_WORDS.test(detail.title);
}
