// Which activity events are Core's own bookkeeping rather than steps a person
// would recognise: the page captures it takes to tell whether a step changed
// anything (state digests), the check it runs before answering a repeated look
// from memory, and the internal tools the build loop calls on itself (budget,
// history, request and decision checks, reading its own draft), plus every
// `note`. None of them is a message, and none of them is the outcome of the
// decision before it.
//
// The list matches the extension's (`apps/extension/src/shared/activity/
// internal-step.ts` in the web-automation repository), so both chats leave out
// the same things.

import type { ConversationActivityDetail } from "../contracts";

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
export function conversationActivityIsInternal(detail: ConversationActivityDetail): boolean {
  if (detail.kind === "note") return true;
  const ref = detail.ref?.trim().toLowerCase() ?? "";
  if (INTERNAL_TOOLS.has(ref) || INTERNAL_WORDS.test(ref)) return true;
  const named = /^using\s+([a-z0-9_.-]+)/iu.exec(detail.title.trim())?.[1]?.toLowerCase();
  if (named !== undefined && INTERNAL_TOOLS.has(named)) return true;
  return INTERNAL_WORDS.test(detail.title);
}
