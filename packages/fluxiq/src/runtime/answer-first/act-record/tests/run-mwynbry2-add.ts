// The "+ Add" of live run `run-mwynbry2-f3c88dc7` (bigbox, attempts 1 and 2), as its stores held it: the act record row
// `.../attempt-acts` in its `global.sqlite`, the command attempt 1's press sent (gateway trace event #223) and the node
// attempt 1's Flow saved for it (step s11, as attempt 2's replay sent it, #150). Hashes and the fixture site's own control
// only: no row value, no address beyond the selector the node itself holds.
//
// Attempt 2's replay pressed it a second time: the saved node carries `requiresChosen`, which the act record counted as
// identity, so its keys (`3836...`) matched none of the landed act's (`d443...`, `1702...`). Read by `../identity/tests/`,
// `./carried-saved-step.test.ts` and `SVC/answer-first/run-acts/tests/carried-saved-step.test.ts`.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActRecordData } from "../contracts.ts";

export const RUN_MWYNBRY2_ACTION = "web.output.dom-click";

const SELECTOR = "main > div > section > div:nth-of-type(3) > div:nth-of-type(1) > button";
const PICKUP = "main > div > aside > fieldset:nth-of-type(2) > label:nth-of-type(1) > input";

/** The control's fingerprint, the same in the press attempt 1 sent and in the node its Flow saved. */
export const RUN_MWYNBRY2_ELEMENT: JsonObject = {
  tagName: "button", implicitRole: "button", accessibleName: "+ Add", selector: SELECTOR, classNames: ["css-1hwwjyf"], attributes: { type: "button" },
  context: { landmark: "main", record: { key: "418830166", keyAttribute: "data-item-id" } }
};

/** What attempt 1's press ran with (`ranWith`), the form its act was recorded under. */
export const RUN_MWYNBRY2_RAN_WITH: JsonObject = { selector: SELECTOR, element: RUN_MWYNBRY2_ELEMENT };

/** The node attempt 1's Flow saved for the press (step s11): the same target, and the run parameters the assembly wrote. */
export const RUN_MWYNBRY2_SAVED_S11: JsonObject = {
  element: RUN_MWYNBRY2_ELEMENT,
  ensureState: { gains: ["added"], loses: ["add"], via: "name" },
  requiresChosen: [{ at: { element: { accessibleName: "Pickup (20)", context: { landmark: "complementary" }, implicitRole: "checkbox", inputType: "checkbox", selector: PICKUP, tagName: "input" }, selector: PICKUP }, words: "Pickup (20)" }],
  selector: SELECTOR,
  timeoutMs: 10000
};

/** The keys the act record held: attempt 1's landed press, and attempt 2's second press of the saved node. */
export const RUN_MWYNBRY2_KEYS = {
  exploration: ["d4434560a28963f1d052fc9459d7f111aa47f929e42d868d685bc0335614e834", "1702ab3d1cb42d8dc06976ca01e55ee3969a5bb05416b6fd21f214bfbb5d9661"],
  run: ["3836718745d3f64b2d9352fd540e427df2bb9b74d0a45779724441e48010c646"]
} as const;

/** Attempt 1's "+ Add" as attempt 2's record was seeded with it: landed, carried, done in an achieved attempt. */
export const RUN_MWYNBRY2_ADD_ACT: AutomationStudioAttemptActEntry = {
  id: "act.b676ccd7cadae558e18cf202ca2043c94e4b03ae",
  what: "+ Add",
  where: "On the site",
  classes: ["modify_existing"],
  state: "landed",
  stage: "exploration",
  actions: [RUN_MWYNBRY2_ACTION],
  keys: [...RUN_MWYNBRY2_KEYS.exploration],
  handleKeys: [],
  rows: ["sha256:c728451b177596c87fa1a508f6125dedcb4bec8a3da46e48e4a5c974aac9be9f"],
  controls: ["98b2aa3701fe2469eeecdaa7efb0d922cd239ee707cb0f120a0b4efcf887d5f0"],
  fingerprinted: true,
  listBefore: [],
  lookedSince: false,
  at: 1795763792395,
  actedOnWords: ["24c84f68bc1fbc6d", "391552c099c101b1", "47cea6234e51694a", "dc098a23f220a2b9", "aafda82aeecb834b", "9d53f79e7113d46c", "a297710417fe141f", "2481b668bc322f38", "5defc92d11f38e34", "2bf175f9655e7bb7", "d10a4bc9e0c1fa4e", "1f3055ba62bd8a1d", "6d2750c38955b347", "6ceb46e4eebe365a", "2acfacae9b03a193", "82f8fc8ed1eed68f", "21f2e9801da46717", "90d9362909f9a91f", "07474afa53a08ba5", "927cdfca6fc5760b"],
  placePath: "27e5da4a4624d4b1",
  rowIdentity: "sha256:c728451b177596c87fa1a508f6125dedcb4bec8a3da46e48e4a5c974aac9be9f",
  doneInAchieved: true,
  carried: true
};

/** A record seeded as attempt 2's was, holding only the "+ Add"; `act` replaces it, to name it otherwise. */
export function runMwynbry2Seed(act: AutomationStudioAttemptActEntry = RUN_MWYNBRY2_ADD_ACT): AutomationStudioAttemptActRecordData {
  return { kind: "attempt_act_record", schemaVersion: 1, acts: [structuredClone(act)], rows: [] };
}
