import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioInstructedActObject } from "../act-object.ts";
import { checkAutomationStudioInstructedActs } from "../check.ts";
import { automationStudioInstructedActsChecklist } from "../checklist.ts";
import { automationStudioInstructedActs } from "../instruction-acts.ts";

// Live run 40 (`run-muq6lqnw-fdfa7aac`, cause 2), bigbox `pickup-cart`. The
// completion was accepted with a1 on step 7 (Millbrook's "Set as my store"),
// a2 on step 29 (the towels' Add to cart), a2.size on step 28 (the 12 Double
// Rolls swatch) and a3 -- the napkins -- on step 26, the Search press that
// submitted the towels' query. "Two packs" was the add marked as repeated (a
// repeat over 28 through 29). The Flow added one pack of towels and no napkins.
const PICKUP_CART = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";

const SITE = "http://127.0.0.1:61777/scenarios/bigbox-retail/";
const TOWELS_RESULTS = `${SITE}search?q=ValueRidge+Select-A-Size+Paper+Towels`;
const TOWELS_PAGE = `${SITE}ip/valueridge-essentials-select-a-size-paper-towels/418830127`;
const NAPKINS_RESULTS = `${SITE}search?q=ValueRidge+Everyday+Dinner+Napkins`;
const NAPKINS_PAGE = `${SITE}ip/valueridge-everyday-dinner-napkins/418831402`;

type Element = { selector: string; accessibleName?: string; visibleText?: string; context?: { record: { text: string } } };
type Json = AutomationStudioFlowDraftStep["input"];

/**
 * A web step as the web domain records one (`node-run/run.ts`): the model's
 * call by handle as `input`, the node's resolved call -- selector and the
 * element's identity -- as `ranWith`, and the page it found as `replay.from`.
 */
function web(position: number, node: string, element: Element, page: string, extra: { parameters?: Json; consequences?: string[]; step?: Partial<AutomationStudioFlowDraftStep> } = {}): AutomationStudioFlowDraftStep {
  const consequences = extra.consequences ?? [];
  return {
    position,
    id: `d${position}`,
    iteration: position,
    actionId: node,
    input: { node, parameters: { target: { handle: `e${position}` }, ...extra.parameters }, consequences },
    ranWith: { node, parameters: { target: element.selector, element, ...extra.parameters } as Json, consequences },
    effect: "mutate",
    effectApplied: true,
    disposition: "kept",
    replay: { from: { location: page } },
    ...extra.step
  };
}

const click = "web.output.dom-click";
const type = "web.output.dom-type";
const navigate = (position: number): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId: "web.output.browser-navigate",
  input: { node: "web.output.browser-navigate", parameters: { url: SITE } }, ranWith: { node: "web.output.browser-navigate", parameters: { url: SITE } },
  effect: "mutate", effectApplied: true, disposition: "kept", replay: { from: { location: SITE } }
});

const store = web(7, click, { selector: "div > ul > li:nth-of-type(3) > button", accessibleName: "Set as my store", context: { record: { text: "Millbrook Crossing Supercenter88 Ferris Rd, Millbrook · 9.8 miOpen 24 hours" } } }, SITE, { consequences: ["modify_existing"] });
const typeTowels = web(25, type, { selector: "input[name=\"q\"]", accessibleName: "Search" }, SITE, { parameters: { text: "ValueRidge Select-A-Size Paper Towels" } });
const searchTowels = web(26, click, { selector: "body > div > header > div > form > button", accessibleName: "Search", visibleText: "⚲" }, SITE);
const towelsLink = web(27, click, { selector: "main > div > section > div:nth-of-type(3) > div:nth-of-type(1) > a:nth-of-type(1)", accessibleName: "ValueRidge Essentials Select-A-Size Paper Towels, 6 Double Rolls" }, TOWELS_RESULTS);
const towelsSize = (step: Partial<AutomationStudioFlowDraftStep> = {}) => web(28, click, { selector: "main > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(2)", visibleText: "12 Double Rolls$16.47" }, TOWELS_PAGE, { step });
const ADD = { selector: "[data-testid=\"atc\"]", accessibleName: "Add to cart" };
const towelsAdd = (position: number, step: Partial<AutomationStudioFlowDraftStep> = {}) => web(position, click, ADD, TOWELS_PAGE, { consequences: ["modify_existing"], step });

// Run 40's draft, as far as it bears on the claims: the store, the towels' search, product, size and add.
const RUN_40 = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize({ routing: { kind: "repeat", over: "d27", through: "d29" } }), towelsAdd(29)];
const RUN_40_CLAIMS = [{ action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a2.size", step: "28" }, { action: "a3", step: "26" }, { action: "a2.quantity", step: "28" }];

// The honest rest: the stepper's "+" for two packs, then the napkins searched, opened, sized and added.
const stepper = web(30, click, { selector: "[data-testid=\"qty-plus\"]", accessibleName: "Increase quantity" }, TOWELS_PAGE);
const typeNapkins = web(32, type, { selector: "input[name=\"q\"]", accessibleName: "Search" }, TOWELS_PAGE, { parameters: { text: "ValueRidge Everyday Dinner Napkins" } });
const searchNapkins = web(33, click, { selector: "body > div > header > div > form > button", accessibleName: "Search", visibleText: "⚲" }, TOWELS_PAGE);
const napkinsLink = web(34, click, { selector: "main > div > section > div:nth-of-type(3) > div:nth-of-type(1) > a:nth-of-type(1)", accessibleName: "ValueRidge Everyday Dinner Napkins, 250 Count" }, NAPKINS_RESULTS);
const napkinsSize = web(35, click, { selector: "main > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1)", visibleText: "250 Count$4.97" }, NAPKINS_PAGE);
const napkinsAdd = web(36, click, ADD, NAPKINS_PAGE, { consequences: ["modify_existing"] });

const check = (draftSteps: readonly AutomationStudioFlowDraftStep[], acts: unknown) =>
  checkAutomationStudioInstructedActs({ instructionText: PICKUP_CART, startLocation: SITE, result: { summary: "x", acts: acts as never }, draftSteps });

describe("a claim is held to what its step acted on", () => {
  it("B run mustzxhi: removing the quantity repeat corrects that fault but missing cart acts still refuse completion", () => {
    const quantity = { ...structuredClone(stepper), routing: { kind: "repeat" as const, over: "d28", through: "d30" }, acts: ["a2.quantity"] };
    const draft = [navigate(1), structuredClone(store), structuredClone(towelsSize()), quantity];
    const claims = [{ action: "a1", step: "7" }, { action: "a2.size", step: "28" }, { action: "a2.quantity", step: "30" }];
    const before = check(draft, claims);
    expect(before.ok).toBe(false);
    if (before.ok) return;
    expect(before.missing.some((item) => item.reason === "quantity_is_a_repeat")).toBe(true);
    expect(before.instruction).toContain("amend_draft unrepeat");
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 30, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    const after = check(draft, claims);
    expect(after.ok).toBe(false);
    if (after.ok) return;
    expect(after.missing.some((item) => item.reason === "quantity_is_a_repeat")).toBe(false);
    expect(after.missing.filter((item) => item.id === "a2" || item.id === "a3").map((item) => item.id)).toEqual(["a2", "a3"]);
  });

  it("reads each act's object in the person's words", () => {
    expect(automationStudioInstructedActs(PICKUP_CART).map((act) => automationStudioInstructedActObject(act)?.name)).toEqual([
      "my pickup store to Millbrook Crossing Supercenter",
      "ValueRidge Essentials Select-A-Size Paper Towels",
      "ValueRidge Everyday Dinner Napkins"
    ]);
  });

  it("refuses run 40's completion: the napkins on the towels' search, and two packs as a repeat", () => {
    const verdict = check(RUN_40, RUN_40_CLAIMS);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.missing.map((missing) => [missing.id, missing.reason, missing.step, missing.actsOn])).toEqual([
      ["a2.quantity", "quantity_is_a_repeat", "28", undefined],
      ["a3", "step_acts_on_another_object", "26", "a2"],
      ["a3.size", "no_step_named", undefined, undefined]
    ]);
    expect(verdict.instruction).toContain("For a3, step 26 acts on ValueRidge Essentials Select-A-Size Paper Towels, which a2 asks for, not on ValueRidge Everyday Dinner Napkins");
    expect(verdict.instruction).toContain("A reason of quantity_is_a_repeat");
  });

  it("refuses the napkins claimed on the towels' Add to cart, naming both objects and the act that step does", () => {
    const draft = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize(), towelsAdd(29), stepper];
    const verdict = check(draft, [{ action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a3", step: "29" }, { action: "a2.size", step: "28" }, { action: "a2.quantity", step: "30" }]);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    const napkins = verdict.missing.find((missing) => missing.id === "a3");
    expect([napkins?.reason, napkins?.step, napkins?.actsOn]).toEqual(["step_acts_on_another_object", "29", "a2"]);
    expect(JSON.stringify(verdict.missingActs)).toContain("\"actsOn\":\"a2\"");
    expect(verdict.instruction).toContain("step 29 acts on ValueRidge Essentials Select-A-Size Paper Towels, which a2 asks for, not on ValueRidge Everyday Dinner Napkins");
    expect(verdict.instruction).toContain("name a3 on a step that acts on ValueRidge Everyday Dinner Napkins");
    // Nothing of the step's own record is said back: no selector, no address.
    expect(verdict.instruction).not.toContain("data-testid");
    expect(verdict.instruction).not.toContain("127.0.0.1");
  });

  it("shows the same on the checklist, with the act the step does", () => {
    const draft = [navigate(1), { ...store, acts: ["a1"] }, typeTowels, searchTowels, towelsLink, { ...towelsSize(), acts: ["a2.size"] }, { ...towelsAdd(29), acts: ["a2", "a3"] }];
    const items = automationStudioInstructedActsChecklist({ instructionText: PICKUP_CART, draftSteps: draft, startLocation: SITE })!;
    expect(items.map((item) => [item.id, item.done, item.todo, item.step, item.actsOn])).toEqual([
      ["a1", 7, undefined, undefined, undefined],
      ["a2", 29, undefined, undefined, undefined],
      ["a3", undefined, "step_acts_on_another_object", 29, "a2"]
    ]);
  });

  it("accepts the napkins claimed on the napkins' own Add to cart, and the honest Flow whole", () => {
    const draft = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize(), towelsAdd(29), stepper, typeNapkins, searchNapkins, napkinsLink, napkinsSize, napkinsAdd];
    const verdict = check(draft, [
      { action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a2.size", step: "28" }, { action: "a2.quantity", step: "30" },
      { action: "a3", step: "36" }, { action: "a3.size", step: "35" }
    ]);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([]);
  });

  it("refuses a size claimed on the other product's swatch, by the page the swatch was on", () => {
    const draft = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize(), towelsAdd(29), stepper, typeNapkins, searchNapkins, napkinsLink, napkinsSize, napkinsAdd];
    const verdict = check(draft, [
      { action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a2.size", step: "28" }, { action: "a2.quantity", step: "30" },
      { action: "a3", step: "36" }, { action: "a3.size", step: "28" }
    ]);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason, missing.actsOn])).toEqual([["a3.size", "step_acts_on_another_object", "a2"]]);
  });

  it("accepts as before a step whose record names no object at all", () => {
    // The add pressed on a page whose address names nothing, with no row, and nothing after it.
    const bare = web(40, click, ADD, `${SITE}cart`, { consequences: ["modify_existing"] });
    const draft = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize(), towelsAdd(29), stepper, napkinsSize, bare];
    const verdict = check(draft, [
      { action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a2.size", step: "28" }, { action: "a2.quantity", step: "30" },
      { action: "a3", step: "40" }, { action: "a3.size", step: "35" }
    ]);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason])).toEqual([]);
    // And a step that carries no record at all, as every draft did before the web domain recorded one.
    const plain = (position: number): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, iteration: position, actionId: click, input: {}, effect: "mutate", effectApplied: true, disposition: "kept" });
    const unrecorded = [navigate(1), plain(2), plain(3), plain(4), plain(5), plain(6), plain(7)];
    expect(check(unrecorded, [{ action: "a1", step: "2" }, { action: "a2", step: "3" }, { action: "a3", step: "4" }, { action: "a2.size", step: "5" }, { action: "a2.quantity", step: "6" }, { action: "a3.size", step: "7" }]).ok).toBe(true);
  });
});

describe("a quantity is set, not repeated", () => {
  const SIZED = [navigate(1), store, typeTowels, searchTowels, towelsLink, towelsSize(), towelsAdd(29), typeNapkins, searchNapkins, napkinsLink, napkinsSize, napkinsAdd];
  const BASE = [{ action: "a1", step: "7" }, { action: "a2", step: "29" }, { action: "a2.size", step: "28" }, { action: "a3", step: "36" }, { action: "a3.size", step: "35" }];
  const withSteps = (...extra: AutomationStudioFlowDraftStep[]) => [...SIZED, ...extra].sort((left, right) => left.position - right.position);
  const reasons = (verdict: ReturnType<typeof check>) => verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason, missing.presses]);

  it("refuses two packs claimed on the add repeated over a list", () => {
    const repeated = withSteps().map((each) => each.position === 29 ? towelsAdd(29, { routing: { kind: "repeat", over: "d27", through: "d29" } }) : each);
    expect(reasons(check(repeated, [...BASE, { action: "a2.quantity", step: "29" }]))).toEqual([["a2.quantity", "quantity_is_a_repeat", undefined]]);
  });

  it("refuses one press of the stepper claimed under a repeat", () => {
    const underRepeat = web(30, click, { selector: "[data-testid=\"qty-plus\"]", accessibleName: "Increase quantity" }, TOWELS_PAGE, { step: { routing: { kind: "repeat", over: "d27", through: "d30" } } });
    expect(reasons(check(withSteps(underRepeat), [...BASE, { action: "a2.quantity", step: "30" }]))).toEqual([["a2.quantity", "quantity_is_a_repeat", undefined]]);
  });

  it("accepts a quantity stepper pressed to two, or a quantity field set to 2", () => {
    expect(check(withSteps(stepper), [...BASE, { action: "a2.quantity", step: "30" }]).ok).toBe(true);
    const field = web(30, type, { selector: "input[name=\"qty\"]", accessibleName: "Quantity" }, TOWELS_PAGE, { parameters: { text: "2" } });
    expect(check(withSteps(field), [...BASE, { action: "a2.quantity", step: "30" }]).ok).toBe(true);
  });

  it("accepts exactly two kept presses of that add on that product, claimed on either", () => {
    expect(check(withSteps(towelsAdd(30)), [...BASE, { action: "a2.quantity", step: "30" }]).ok).toBe(true);
    expect(check(withSteps(towelsAdd(30)), [...BASE, { action: "a2.quantity", step: "29" }]).ok).toBe(true);
  });

  it("refuses presses of the add that are not the count, and counts them", () => {
    expect(reasons(check(withSteps(towelsAdd(30), towelsAdd(31)), [...BASE, { action: "a2.quantity", step: "30" }]))).toEqual([["a2.quantity", "quantity_presses_differ", [29, 30, 31]]]);
    // A second press withdrawn from the Flow is not a press of it: the add claimed for its own quantity is the add's press, as before.
    expect(reasons(check(withSteps(towelsAdd(30, { disposition: "dropped" })), [...BASE, { action: "a2.quantity", step: "29" }]))).toEqual([["a2.quantity", "choice_is_the_act_step", undefined]]);
  });

  it("does not count the same add on another product as a press of this one", () => {
    // The napkins' add has the same control and argument as the towels', on another page.
    expect(check(withSteps(stepper), [...BASE, { action: "a2.quantity", step: "30" }]).ok).toBe(true);
    const verdict = check(withSteps(), [...BASE, { action: "a2.quantity", step: "36" }]);
    expect(verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason, missing.actsOn])).toEqual([["a2.quantity", "step_acts_on_another_object", "a3"]]);
  });
});

// The ten realistic sites' consequential instructions, as their
// `apps/scenario-lab/src/scenarios/*/live-tasks.ts` in the web repository read
// on 2026-10-01 (t195-w24b): the everything-store narrow and the friend
// requests are worded as they now are there, and the job-board apply is
// `instruction-acts.test.ts`'s copy without the candidate's details, which
// name no act. An honest Flow for each -- every act and choice done by a step
// of its own on the page of its own object -- must still pass.
const CONSEQUENTIAL: ReadonlyArray<readonly [string, string]> = [
  ["local-classifieds tables", "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status."],
  ["local-classifieds offer", "Send the seller an offer of £140 for the cheapest folding bike listed within 10 miles of Kelford in the last 7 days that is in like-new condition. Sponsored posts are adverts, not listings, so leave them out, and don't send any other message."],
  ["crossborder hub to cart", "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything."],
  ["crossborder buy hub", "On Farbazaar, buy two of the Voltbay USB-C hub sold by Voltbay Official Store: Space Grey, the 7-in-1 version, shipped from Spain, with standard shipping. Collect and use that store's coupon, and pay with my saved Visa card. Then give me the order confirmation with columns order, item, options, quantity and total."],
  ["bigbox pickup cart", PICKUP_CART],
  ["bigbox pickup order", "Order one pack of ValueRidge Essentials Select-A-Size Paper Towels in the 6 Double Rolls size for pickup at my current store, and nothing else: whatever is already in my cart should be saved for later, not bought and not deleted. Check out as a guest as Dana Whitfield, email dana.whitfield@example.com, phone 555-014-2290, take the earliest pickup time on offer, and pay at pickup. Once the order is placed, give me a one-row table with columns order, item, quantity, total and pickup: the order number, the item as the confirmation names it, how many, the order total written like $12.97, and the pickup window exactly as the confirmation writes it."],
  ["job board save week", "Save every job Halvard Systems has posted on Rolefinch in the last 7 days to my saved jobs, without unsaving anything that is already there, and then open my saved jobs so the list is showing."],
  ["job board apply", "Apply for the Senior Rust Engineer job at Quillmark that is fully remote in the UK, on Quillmark's own careers site. Once the application has been sent, give me its confirmation as a table with columns role, company and reference."],
  ["auction watch endings", "On Hammerline, add to my watchlist every auction for a Kestrel 35 camera that ends before midnight at the end of Tuesday 22 September and whose current bid is under £100, counting a listing priced in another currency at the pound estimate the site shows for it. Only the original Kestrel 35 itself counts, not the 35S, the Mark II, the 350 or an accessory, and nothing listed as for parts or not working. Then list everything on my watchlist, in the order the watchlist shows it, with columns title and price exactly as the watchlist shows them."],
  ["auction place bid", "On Hammerline, place a maximum bid of £85 on the Kestrel 35 camera that the seller harrow_cameras has up for auction. I mean the original Kestrel 35, not the 35S. Make sure the bid went through."],
  ["everything store kettle to cart", "Put two Tidewell electric kettles in sage green, 1.7 litre, sold by Brightaisle itself, in my cart, and move the phone case that is already in my cart to Save for later. Then give me what is in my cart, leaving out the saved items, as a table with columns item, quantity and price, where quantity is a plain number and price is the price of one."],
  ["everything store buy kettle", "Buy one new Tidewell electric kettle, 1.7 litre, in matte black, sold by Brightaisle itself, delivered free with standard delivery to my home address and paid with my Visa. I want only the kettle: nothing else ordered, nothing signed up for, and the other things in my cart left where they are."],
  ["everything store narrow", "Search the store for wireless earbuds, narrow the results to Brightaisle Plus items, and collect every search result on the first page, leaving out sponsored placements, into a table with columns name, price, rating and url."],
  ["photo social collection", "Create a collection in my saved posts called Glaze ideas that holds exactly the three most-liked posts the verified Harbourlight Studio account published in August 2026, and leave my other collections as they are."],
  ["social group post", "Post this in the Riverside Allotment Society group, word for word: \"Spare rhubarb crowns at plot 14, free to anyone who can collect them this weekend. Bring a bag!\" Then make sure it is waiting for the group's admins to approve it."],
  ["social confirm requests", "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is. Then give me a table of every request the list now shows as accepted, in the order the list shows them, with columns name and mutualFriends, where mutualFriends is written exactly as their request shows it."],
  ["company quote request", "Ask Kestrel Lane for a free quote to replace my boiler with a combi boiler. My details: Ada Synthetic, ada.synthetic@example.test, 07700 900123, and the property's postcode is KL6 2RN. Tell them the current boiler is a 2009 floor-standing model in the kitchen, ask them to reply by email, and do not sign me up for any marketing. Make sure the request actually reaches them."],
  ["company book service", "Book an annual boiler service for my combi boiler at Kestrel Lane's Hollins Cross branch, in the earliest weekday morning slot on or after Thursday 1 October 2026. Use my details: Ada Synthetic, ada.synthetic@example.test, 07700 900123, postcode KL6 2RN. Then give me the booking confirmation as a table with columns reference, branch, date, time and engineer, written exactly as the confirmation shows them."],
  ["professional withdraw", "On Guildline, withdraw every connection request I sent a month or more ago that is still waiting for an answer. Leave the newer requests alone, and don't touch invitations to follow a page or subscribe to a newsletter, or anything people have sent me."]
];

/**
 * An honest draft for an instruction: for each act, on the page of its own
 * object, a step for each choice that sets it and then the act's own press --
 * declaring its class, and repeated over a list read where the act is over a
 * whole set -- each claimed by id.
 */
function honest(instruction: string): { draft: AutomationStudioFlowDraftStep[]; claims: Array<{ action: string; step: string }> } {
  const draft: AutomationStudioFlowDraftStep[] = [navigate(1)];
  const claims: Array<{ action: string; step: string }> = [];
  let position = 2;
  for (const act of automationStudioInstructedActs(instruction)) {
    const slug = (automationStudioInstructedActObject(act)?.name ?? act.quote).toLowerCase().replace(/[^a-z0-9]+/gu, "-");
    const page = `${SITE}item/${slug}`;
    const listing: AutomationStudioFlowDraftStep | undefined = act.plural
      ? { position, id: `d${position}`, iteration: position, actionId: "web.output.dom-extract-list", input: {}, effect: "observe", proposes: true, disposition: "kept" }
      : undefined;
    if (listing) { draft.push(listing); position += 1; }
    for (const choice of act.requires ?? []) {
      const setting = choice.choice === "quantity"
        ? web(position, type, { selector: "input[name=\"qty\"]", accessibleName: "Quantity" }, page, { parameters: { text: choice.value } })
        : web(position, click, { selector: "[data-option]", visibleText: choice.value }, page);
      draft.push(setting);
      claims.push({ action: choice.id, step: `${position}` });
      position += 1;
    }
    const routing = listing ? { routing: { kind: "repeat" as const, over: listing.id!, through: `d${position}` } } : {};
    draft.push(web(position, click, { selector: "[data-act]", accessibleName: "Do it" }, page, { consequences: act.consequence ? [act.consequence] : [], step: routing }));
    claims.push({ action: act.id, step: `${position}` });
    position += 1;
  }
  return { draft, claims };
}

const refusals = (verdict: ReturnType<typeof checkAutomationStudioInstructedActs>) => verdict.ok ? [] : verdict.missing.map((missing) => [missing.id, missing.reason, missing.actsOn]);

describe("the ten realistic sites' instructions, done honestly", () => {
  it.each(CONSEQUENTIAL)("still accepts an honest Flow for %s", (_label, instruction) => {
    const { draft, claims } = honest(instruction);
    expect(refusals(checkAutomationStudioInstructedActs({ instructionText: instruction, result: { summary: "x", acts: claims }, draftSteps: draft }))).toEqual([]);
  });

  it("refuses each add of the pickup cart claimed on the other product's step", () => {
    const { draft, claims } = honest(PICKUP_CART);
    const swapped = claims.map((claim) => claim.action === "a2" ? { ...claim, action: "a3" } : claim.action === "a3" ? { ...claim, action: "a2" } : claim);
    expect(refusals(checkAutomationStudioInstructedActs({ instructionText: PICKUP_CART, result: { summary: "x", acts: swapped }, draftSteps: draft }))).toEqual([
      ["a2", "step_acts_on_another_object", "a3"],
      ["a3", "step_acts_on_another_object", "a2"]
    ]);
  });

  it.each([
    ["the phone case's move on the kettle's add", "everything store kettle to cart"],
    ["the store's coupon on the hub's add", "crossborder hub to cart"]
  ])("refuses %s", (_label, which) => {
    const instruction = CONSEQUENTIAL.find(([label]) => label === which)![1];
    const { draft, claims } = honest(instruction);
    const onTheAdd = claims.map((claim) => claim.action === "a2" ? { ...claim, step: claims.find((each) => each.action === "a1")!.step } : claim);
    expect(refusals(checkAutomationStudioInstructedActs({ instructionText: instruction, result: { summary: "x", acts: onTheAdd }, draftSteps: draft }))).toEqual([["a2", "step_acts_on_another_object", "a1"]]);
  });
});
