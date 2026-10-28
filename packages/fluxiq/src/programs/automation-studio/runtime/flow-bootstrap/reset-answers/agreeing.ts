// One answer never says both that a call can meet its act's condition and
// that no call can settle that act (t772 R2, rerun round 6
// `run-mvrj7qg9-b6dc94f6`, cause 2). An undo refused there said "another call
// on this page can meet it" (`canMeet: this_page`) beside an `actsUnsettleable`
// that listed the very act it refused, as one no call could put back; the
// reset builder believed the list, gave the act up, and its brief ended
// blocked over acts two presses would have settled.
//
// The check is closed: wherever a refusal names its own act (`act`) and says a
// call on this page or another can meet its condition, that act is never
// listed under `actsUnsettleable`. It is listed under `actsToUndo` instead, as
// the act it is (`act`, `did`, `call`), so the answer stays one answer. The
// refusal constructor (`./refusal.ts`) applies it, and so does the ledger
// where it lists acts no call can settle beside a refusal it did not build
// (`../site-reset/ledger.ts`, `target`). A refusal no call can meet keeps the
// list as the ledger gave it. Acts the ledger lists apart on a read that says
// nothing yet are kept out at their source, not here
// (`../reset-settlement/observations.ts`, `readInPlace`).

/** The fields of an answer this check reads; any other passes through. */
type Answer = { act?: unknown; canMeet?: unknown; actsUnsettleable?: unknown; actsToUndo?: unknown };

/** `answer`, with its own act moved from `actsUnsettleable` to `actsToUndo` where its `canMeet` says a call can meet it (header). */
export function automationStudioSiteResetAnswerAgreeing<A extends object>(answer: A): A {
  const said: Answer = answer;
  const act = said.act;
  if (typeof act !== "string" || (said.canMeet !== "this_page" && said.canMeet !== "another_page") || !Array.isArray(said.actsUnsettleable)) return answer;
  const listed: unknown[] = said.actsUnsettleable;
  const own = listed.find((entry) => named(entry) === act);
  if (own === undefined) return answer;
  const apart = listed.filter((entry) => named(entry) !== act);
  const toUndo: unknown[] = Array.isArray(said.actsToUndo) ? said.actsToUndo : [];
  const { reason: _reason, failed: _failed, ...asAct } = own as Record<string, unknown>;
  const { actsUnsettleable: _apart, ...rest } = said;
  return { ...rest, actsToUndo: toUndo.some((entry) => named(entry) === act) ? toUndo : [...toUndo, asAct], ...(apart.length ? { actsUnsettleable: apart } : {}) } as unknown as A;
}

/** The act an entry of either list names. */
function named(entry: unknown): unknown {
  return typeof entry === "object" && entry !== null ? (entry as { act?: unknown }).act : undefined;
}
