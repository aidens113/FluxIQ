// What a step that moves a list on said of that list, as a call's answer carries it (t1013), and the paging it settles.
//
// A domain's answer to such a step (a next page, a load more) carries `listMove`: the `listKey` of the list it moved,
// made from the site's structure exactly as a read of that list carries it (`engine/automation/records/read/list-key.ts`),
// the verdict (`moved`, or `ended` when the list showed no way on on its own page), the domain's words for an end, and
// where the pager marked the list after the move, where it marks one. A domain answers this only from the list's own
// page: a move whose list is not on the page is refused, and carries nothing (bikes run-mwug2xjw-41f62603, step 0089).
//
// Every draft read step reading that list (`listKey` equal; compared, never parsed) gets the verdict on its most
// recently read page (`../result/ledger.ts`, `paging`), so the header can say a page follows, the list ended, or it is
// not yet checked. Before this only a forward run's pass could say it, and a move the model ran itself never settled
// anything: the header kept saying nothing had said whether a page follows, and pulled the model back to paging.
//
// **An end is only the end of the page it was seen after.** Where the pager marks both the read's place and the
// move's, as numbers of one name, an end seen at a later place than the step's latest page says a page follows that
// page (the list went on past it, unread), and an end or a move seen at an earlier place says nothing of it. Where
// either says no place, or they are not comparable, the domain's word stands.
import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstResultNumberedPlace, type AutomationStudioAnswerFirstResultEvent, type AutomationStudioAnswerFirstResultLedger, type AutomationStudioAnswerFirstResultPaging } from "../result/index.ts";

/** What a move said of its list, read off its answer (`listMove`); see the header. */
export type AutomationStudioAnswerFirstListMove = { listKey: string; verdict: "moved" | "ended"; said?: string; place?: string };

/** A key longer than this is not one: the same bound a read's `listKey` is held to. */
const MAX_LIST_KEY_LENGTH = 200;
/** A domain's words for an end are a short clause; anything longer is not taken. */
const MAX_SAID_LENGTH = 300;
const MAX_PLACE_LENGTH = 200;
const ENDED_WORDS = "the step that moves the list on found no way on on the list's own page";

/** The `listMove` an answer's evidence carries, or `undefined` where it carries none that is well formed. */
export function automationStudioAnswerFirstListMoveOf(evidence: JsonValue | undefined): AutomationStudioAnswerFirstListMove | undefined {
  if (!isObject(evidence) || !isObject(evidence.listMove)) return undefined;
  const move = evidence.listMove;
  const listKey = move.listKey;
  if (typeof listKey !== "string" || listKey === "" || listKey.length > MAX_LIST_KEY_LENGTH) return undefined;
  if (move.verdict !== "moved" && move.verdict !== "ended") return undefined;
  const said = typeof move.said === "string" && move.said.trim() !== "" && move.said.length <= MAX_SAID_LENGTH ? move.said.trim() : undefined;
  const place = typeof move.place === "string" && move.place !== "" && move.place.length <= MAX_PLACE_LENGTH ? move.place : undefined;
  return { listKey, verdict: move.verdict, ...(said === undefined ? {} : { said }), ...(place === undefined ? {} : { place }) };
}

/** The paging events a move settles: one for each draft read step of its list that has read a page. */
export function automationStudioAnswerFirstListMovePaging(ledger: AutomationStudioAnswerFirstResultLedger, move: AutomationStudioAnswerFirstListMove): AutomationStudioAnswerFirstResultEvent[] {
  return ledger.steps.flatMap((step): AutomationStudioAnswerFirstResultEvent[] => {
    if (step.reads.listKey !== move.listKey || !step.pages.length) return [];
    const latest = step.pages.reduce((one, other) => (other.seq > one.seq ? other : one));
    const paging = settled(move, latest.place);
    return paging ? [{ kind: "paging", stepId: step.id, paging }] : [];
  });
}

/** What `move` says after a page read at `read`; see the header. */
function settled(move: AutomationStudioAnswerFirstListMove, read: string | undefined): AutomationStudioAnswerFirstResultPaging | undefined {
  const at = automationStudioAnswerFirstResultNumberedPlace(move.place);
  const last = automationStudioAnswerFirstResultNumberedPlace(read);
  // How far the move's place is past the read's: positive later, zero the same, negative earlier; absent, not comparable.
  const past = at !== undefined && last !== undefined && at.name === last.name ? at.value - last.value : undefined;
  if (move.verdict === "ended") {
    if (past === undefined || past === 0) return { verdict: "ended", reason: move.said ?? ENDED_WORDS };
    return past > 0 ? { verdict: "moved" } : undefined;
  }
  return past === undefined || past > 0 ? { verdict: "moved" } : undefined;
}

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
