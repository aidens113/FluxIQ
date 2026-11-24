// What a domain declared of a list's paging from the site's structure, as a call's answer carries it (t1032), and the
// ledger's events for it.
//
// A domain that finds a list on a page knows whether the list shows a way to another page (a Next link, numbered
// pages, a load-more control, a feed that scrolls on). Its answer to that call carries `listPaging`: for each list it
// found, the `listKey` a read of that list carries (`engine/automation/records/read/list-key.ts`, made from the site's
// structure, compared and never parsed) and `pages`, whether the list shows such a way. The ledger keeps the latest
// declaration of each list (`../result/ledger.ts`), and the header says a read step whose list shows no pager holds one
// page, where it would otherwise say its paging is not yet checked (`../result/header.ts`).
//
// Run-mwv5m906-5e999159: the detection said `pagination: "none"` for the list the result's step read, the header said
// "paging after unplaced read 1 not yet checked" all the same, and the model spent 24 decisions searching for a pager.
// A declaration says nothing of where the pager is or whether a read reached the list's end: a list that pages is still
// not yet checked until a move or a run's pass settles it (`./list-move.ts`).
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstResultEvent } from "../result/index.ts";

/** A key longer than this is not one: the same bound a read's `listKey` and a move's are held to. */
const MAX_LIST_KEY_LENGTH = 200;

/** The `pager` events an answer's evidence declares; none where it declares none that is well formed. */
export function automationStudioAnswerFirstListPagerEvents(evidence: JsonValue | undefined): AutomationStudioAnswerFirstResultEvent[] {
  if (!isObject(evidence) || !Array.isArray(evidence.listPaging)) return [];
  return evidence.listPaging.flatMap((entry): AutomationStudioAnswerFirstResultEvent[] => {
    if (!isObject(entry)) return [];
    const { listKey, pages } = entry;
    if (typeof listKey !== "string" || listKey === "" || listKey.length > MAX_LIST_KEY_LENGTH || typeof pages !== "boolean") return [];
    return [{ kind: "pager", listKey, pages }];
  });
}

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
