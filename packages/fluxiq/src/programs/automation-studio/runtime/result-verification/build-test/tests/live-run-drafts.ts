// The drafts the build-test judge is tested on, each the shape of a live run
// t195-w25 traced: run 36 (an act claimed on a listing), run 40 (the napkins
// claimed on the towels' Search press), run 41 (a re-authored Flow carried and
// never run). Lane B (a size claimed on the Add press) is run 40's draft with
// the claim moved.
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioBuildTestReportInput } from "../summary.ts";
import { SITE, navigate, present, replayed, report, web } from "./draft-steps.ts";

const click = "web.output.dom-click";
const TOWELS_RESULTS = `${SITE}search?q=ValueRidge+Select-A-Size+Paper+Towels`;
const TOWELS_PAGE = `${SITE}ip/valueridge-essentials-select-a-size-paper-towels/418830127`;

export const PICKUP_CART = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";

// Run 40 (`run-muq6lqnw-fdfa7aac`): the Flow's steps, renumbered as the Flow
// runs them. One search, one product, one size, one Add -- all the towels'.
const ADD = { selector: "[data-testid=\"atc\"]", accessibleName: "Add to cart" };
export const run40 = {
  navigate: navigate(1),
  rejectAll: web(2, click, { selector: "#onetrust-reject-all-handler", accessibleName: "Reject all" }, SITE),
  store: web(3, click, { selector: "div > ul > li:nth-of-type(3) > button", accessibleName: "Set as my store", context: { record: { text: "Millbrook Crossing Supercenter88 Ferris Rd, Millbrook · 9.8 miOpen 24 hours" } } }, SITE, { consequences: ["modify_existing"] }),
  typeTowels: web(4, "web.output.dom-type", { selector: "input[name=\"q\"]", accessibleName: "Search" }, SITE, { parameters: { text: "ValueRidge Select-A-Size Paper Towels" } }),
  searchTowels: web(5, click, { selector: "body > div > header > div > form > button", accessibleName: "Search", visibleText: "⚲" }, SITE),
  towelsLink: web(6, click, { selector: "main > div > section > div:nth-of-type(3) > div:nth-of-type(1) > a:nth-of-type(1)", accessibleName: "ValueRidge Essentials Select-A-Size Paper Towels, 6 Double Rolls" }, TOWELS_RESULTS),
  towelsSize: web(7, click, { selector: "main > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(2)", visibleText: "12 Double Rolls$16.47" }, TOWELS_PAGE),
  towelsAdd: web(8, click, ADD, TOWELS_PAGE, { consequences: ["modify_existing"], step: { resultCode: "web.clicked", stateBefore: "s7", stateAfter: "s8" } })
};
export const RUN_40_STEPS = Object.values(run40);
export const RUN_40_CLAIMS = [{ action: "a1", step: "3" }, { action: "a2", step: "8" }, { action: "a2.size", step: "7" }, { action: "a3", step: "5" }, { action: "a2.quantity", step: "7" }];

// Run 36 (`run-muq3uozx-3153564b`): the Friends home's requests read with a
// condition, and a Confirm repeated over the read, each Confirm `present`
// because "Request accepted" was already shown.
export const FRIENDS = "http://127.0.0.1:61777/scenarios/social/friends";
export const ACCEPT_FRIENDS = "Accept every friend request from someone with at least five mutual friends, and give me a table of the requests you accepted with each person's name and their number of mutual friends.";
const confirm = (position: number, person: string, mutual: string) => web(position, click, {
  selector: `div[aria-label="${person}"] > button:nth-of-type(1)`, accessibleName: "Confirm", context: { record: { text: `${person}${mutual}ConfirmDelete` } }
}, FRIENDS, { consequences: ["modify_existing"] });
const listing: AutomationStudioFlowDraftStep = {
  position: 4, id: "d4", iteration: 4, actionId: "web.input.list-read",
  input: { node: "web.input.list-read", parameters: { where: "mutual matches /(?:[5-9]|[1-9][0-9]+) mutual/", columns: ["name", "mutual"] } },
  ranWith: { node: "web.input.list-read", parameters: { where: "mutual matches /(?:[5-9]|[1-9][0-9]+) mutual/", columns: ["name", "mutual"], selector: "div[role=\"main\"] > div > a" } },
  effect: "observe", proposes: true, disposition: "kept", replay: { from: { location: FRIENDS } }, acts: ["a1"]
};
export const run36 = {
  navigate: navigate(1, FRIENDS),
  dismiss: web(2, click, { selector: "#dismiss", accessibleName: "Not now" }, FRIENDS, { step: { routing: { kind: "optional" } } }),
  friendsLink: web(3, click, { selector: "a[href=\"/friends\"]", accessibleName: "Friends" }, FRIENDS),
  listing,
  amara: confirm(5, "Amara Osei", "23 mutual friends"),
  priya: { ...confirm(6, "Priya Nair", "4 mutual friends"), acts: ["a1"] },
  jonas: { ...confirm(7, "Jonas Weber", "Aisha Khan and 4 other mutual friends"), routing: { kind: "repeat" as const, over: "d4", through: "d7" } }
};
export const RUN_36_STEPS = Object.values(run36);
/** Step 4's one-row read, from a list of four on the Friends home. */
export const RUN_36_READ: JsonObject = { rows: [{ name: "Amara Osei", mutual: "23 mutual friends" }], itemsSeen: 4 };
export const run36Report = (): AutomationStudioBuildTestReportInput => report(
  [replayed(run36.navigate), replayed(run36.dismiss), replayed(run36.friendsLink), replayed(run36.listing), present(run36.amara), present(run36.priya), present(run36.jonas)],
  [[run36.listing, RUN_36_READ], [run36.amara, { answer: "present" }], [run36.priya, { answer: "present" }], [run36.jonas, { answer: "present" }]]
);

/**
 * Run 41 (`run-muq70foz-74caa189`): the earlier Flow seeded as `f<n>` steps, of
 * which the model reran the first four live and carried 5-9 untouched.
 */
export function run41Steps(): AutomationStudioFlowDraftStep[] {
  const live = [run40.navigate, run40.rejectAll, run40.store, run40.typeTowels];
  const carried = [5, 6, 7, 8, 9].map((position): AutomationStudioFlowDraftStep => ({
    position, id: `f${position}`, iteration: 0, actionId: click, toolId: "core.run_node",
    input: { node: click, parameters: { element: { accessibleName: position === 9 ? "Add to cart" : `Step ${position}` } } },
    effect: "mutate", proposes: true, disposition: "kept"
  }));
  return [...live, ...carried];
}
