import { describe, expect, it } from "vitest";
import { automationStudioInstructedActs } from "../instruction-acts.ts";

// The ten realistic sites' instructions, copied word for word from the web
// repository's `apps/scenario-lab/src/scenarios/*/live-tasks.ts` on 2026-09-28.
// They are the corpus the vocabulary was written against, so they pin it in
// both directions: every consequential task yields its acts, and no extraction
// task yields any.
const CONSEQUENTIAL: ReadonlyArray<[string, string, Array<[string, string]>]> = [
  ["local-classifieds tables", "Save the three cheapest dining tables for sale within 5 miles of Kelford to my saved items, then give me a table of everything in my saved items, cheapest first, with columns title, price and status.", [["save", "save"], ["open", "give"]]],
  ["crossborder hub to cart", "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything.", [["add_to", "put"], ["claim", "collect"]]],
  ["bigbox pickup cart", "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.", [["set", "switch"], ["add_to", "add"], ["add_to", "add"]]],
  ["job board save week", "Save every job Halvard Systems has posted on Rolefinch in the last 7 days to my saved jobs, without unsaving anything that is already there, and then open my saved jobs so the list is showing.", [["save", "save"], ["open", "open"]]],
  ["auction watch endings", "On Hammerline, add to my watchlist every auction for a Kestrel 35 camera that ends before midnight at the end of Tuesday 22 September and whose current bid is under £100, counting a listing priced in another currency at the pound estimate the site shows for it. Only the original Kestrel 35 itself counts, not the 35S, the Mark II, the 350 or an accessory, and nothing listed as for parts or not working. Then list everything on my watchlist, in the order the watchlist shows it, with columns title and price exactly as the watchlist shows them.", [["add_to", "add"], ["open", "list"]]],
  ["auction place bid", "On Hammerline, place a maximum bid of £85 on the Kestrel 35 camera that the seller harrow_cameras has up for auction. I mean the original Kestrel 35, not the 35S. Make sure the bid went through.", [["submit", "place"]]],
  ["everything store kettle to cart", "Put two Tidewell electric kettles in sage green, 1.7 litre, sold by Brightaisle itself, in my cart, and move the phone case that is already in my cart to Save for later. Then give me what is in my cart, leaving out the saved items, as a table with columns item, quantity and price, where quantity is a plain number and price is the price of one.", [["add_to", "put"], ["move", "move"], ["open", "give"]]],
  ["local-classifieds offer", "Send the seller an offer of £140 for the cheapest folding bike listed within 10 miles of Kelford in the last 7 days that is in like-new condition. Sponsored posts are adverts, not listings, so leave them out, and don't send any other message.", [["submit", "send"]]],
  ["company quote request", "Ask Kestrel Lane for a free quote to replace my boiler with a combi boiler. My details: Ada Synthetic, ada.synthetic@example.test, 07700 900123, and the property's postcode is KL6 2RN. Tell them the current boiler is a 2009 floor-standing model in the kitchen, ask them to reply by email, and do not sign me up for any marketing. Make sure the request actually reaches them.", [["submit", "ask"]]],
  ["company book service", "Book an annual boiler service for my combi boiler at Kestrel Lane's Hollins Cross branch, in the earliest weekday morning slot on or after Thursday 1 October 2026. Use my details: Ada Synthetic, ada.synthetic@example.test, 07700 900123, postcode KL6 2RN. Then give me the booking confirmation as a table with columns reference, branch, date, time and engineer, written exactly as the confirmation shows them.", [["submit", "book"]]],
  ["photo social collection", "Create a collection in my saved posts called Glaze ideas that holds exactly the three most-liked posts the verified Harbourlight Studio account published in August 2026, and leave my other collections as they are.", [["submit", "create"]]],
  ["social group post", "Post this in the Riverside Allotment Society group, word for word: \"Spare rhubarb crowns at plot 14, free to anyone who can collect them this weekend. Bring a bag!\" Then make sure it is waiting for the group's admins to approve it.", [["submit", "post"]]],
  ["social confirm requests", "Go through my friend requests and confirm everyone I have at least five mutual friends with, and leave every other request as it is. Then give me a table of the people you confirmed, in the order their requests are listed, with columns name and mutualFriends, where mutualFriends is written exactly as their request shows it.", [["submit", "confirm"]]],
  ["professional withdraw", "On Guildline, withdraw every connection request I sent a month or more ago that is still waiting for an answer. Leave the newer requests alone, and don't touch invitations to follow a page or subscribe to a newsletter, or anything people have sent me.", [["submit", "withdraw"]]],
  ["crossborder buy hub", "On Farbazaar, buy two of the Voltbay USB-C hub sold by Voltbay Official Store: Space Grey, the 7-in-1 version, shipped from Spain, with standard shipping. Collect and use that store's coupon, and pay with my saved Visa card. Then give me the order confirmation with columns order, item, options, quantity and total.", [["submit", "buy"], ["claim", "collect"]]],
  ["everything store narrow", "Search the store for wireless earbuds, narrow the results to Brightaisle Plus items, and collect every product on the first page of results, leaving out sponsored placements, into a table with columns name, price, rating and url.", [["set", "narrow"]]],
  ["job board apply", "Apply for the Senior Rust Engineer job at Quillmark that is fully remote in the UK, on Quillmark's own careers site. Once the application has been sent, give me its confirmation as a table with columns role, company and reference.", [["submit", "apply"]]]
];

const READ_ONLY: ReadonlyArray<[string, string]> = [
  ["auction kestrel", "On Hammerline, collect every auction for a Kestrel 35 camera: the original Kestrel 35 itself, not the 35S, the Mark II or the 350, and not a lens, case, box or any other accessory. Leave out anything listed as for parts or not working, and anything whose current bid is £150 or more, counting a listing priced in another currency at the pound estimate the site shows for it. Auctions that also offer Buy it now count; fixed-price listings do not. List each auction once, soonest-ending first, with columns title, price, bids and postage, each exactly as the listing's search result shows it, the price in the listing's own currency."],
  ["bigbox towels", "On ValueRidge, find every pack of paper towels that ValueRidge sells itself rather than a marketplace seller, that my store can have ready for pickup today, and that is rated 4.5 stars or higher. The search results for paper towels run over several pages; leave out sponsored listings and list each product once, in the order the results show them under Best match. Give me a table with columns name, price, unitPrice and rating, where name is the product name as listed, price is the current price written like $12.97, unitPrice is the price per unit exactly as printed, like 1.2 ¢/sheet, and rating is the average star rating as a number, like 4.6."],
  ["crossborder spain hubs", "On Farbazaar, search for \"usb c hub\" and collect every hub that ships from Spain, has free shipping and is rated 4.5 stars or higher, across all of the results. Leave out the ads and list each item only once, keeping the order the search ranks them in by default (Best Match), with columns title, store, price and rating, written exactly as the results show them."],
  ["classifieds bikes", "On Kerbfind Marketplace, find every bicycle for sale within 10 miles of Kelford that costs from £100 to £400 and is new, like new or in good condition. List each bike once, cheapest first, and leave out sponsored posts, in a table with columns title, price, location and url, where location is the place the listing names and url is the address of the listing's own page."],
  ["company engineers", "From Kestrel Lane's team page, list everyone based at the Eastmoor or Hollins Cross branch who holds a Gas Safe ID. Include each person once, in the order the team page lists them when it is showing everyone, as a table with columns name, role, branch and gasSafeId, where gasSafeId is the ID number exactly as their card shows it."],
  ["feed digest", "Go through my Circleway home feed down to where it says I'm all caught up and collect every post my friends wrote themselves, including the ones they posted in groups. Leave out adverts, suggested posts, anything a friend only shared from someone else, and my own posts and memories, and list each post once even if the feed shows it again further down."],
  ["moon jar", "Saltmarsh Goods has posted a speckled moon jar without saying what it costs. Find out what they are asking for it and give me a one-row table with columns item and price, with the piece's name and its price exactly as the shop gives them."],
  ["rotterdam", "Use Guildline's people search to find data engineers who are 2nd-degree connections and based in Rotterdam in the Netherlands (not the Rotterdam in New York). Collect every person the search returns across all of its pages into a table with columns name, headline and location, listing each person only once and leaving out anything marked as promoted."],
  ["invitation allowance", "Guildline says I've hit my weekly invitation limit. Deal with my connection requests that have been sitting unanswered for a month or more so they stop counting against it, and leave everything else as it is."],
  ["apply check first", "Get an application ready for the Senior Rust Engineer job at Quillmark that is fully remote in the UK, on Quillmark's own careers site. Fill everything in, but check with me before the application is actually sent. Once it has been sent, give me its confirmation as a table with columns role, company and reference."]
];

describe("the lasting acts an instruction asks for", () => {
  it.each(CONSEQUENTIAL)("reads %s", (_label, instruction, expected) => {
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.map((act) => [act.kind, act.verb])).toEqual(expected);
    expect(acts.map((act) => act.id)).toEqual(expected.map((_entry, index) => `a${index + 1}`));
  });

  it.each(READ_ONLY)("reads no act in %s", (_label, instruction) => {
    expect(automationStudioInstructedActs(instruction)).toEqual([]);
  });

  it("reads no act in an instruction that asks for the automation itself", () => {
    // The service fixtures' instruction, which t196 found read as a `create` act.
    expect(automationStudioInstructedActs("Create a deterministic Start to End Flow.")).toEqual([]);
    expect(automationStudioInstructedActs("Flow\nCreate an automation that lists the new jobs.")).toEqual([]);
    // Creating something on the target still is one.
    expect(automationStudioInstructedActs("Create a collection in my saved posts called Glaze ideas.").map((act) => [act.kind, act.verb])).toEqual([["submit", "create"]]);
    // And a later act in the same sentence is still read past it.
    expect(automationStudioInstructedActs("Create a Flow, then save the Brightline kettle to my saved items.").map((act) => [act.kind, act.verb])).toEqual([["save", "save"]]);
  });

  it("drops an act the instruction forbids", () => {
    expect(automationStudioInstructedActs("Add the kettle to my cart. Do not buy anything, and do not check out.").map((act) => act.kind)).toEqual(["add_to"]);
  });

  // No character cut and no count cap (user, 2026-09-30: "Remove ANY AND ALL
  // LIMITS ON THE NUMBER OF ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION").
  it("quotes the person's own sentence whole, however long", () => {
    const [act] = automationStudioInstructedActs(`Save ${"the cheapest table ".repeat(30)}to my saved items.`);
    expect(act?.quote).toBe(`Save ${"the cheapest table ".repeat(30)}to my saved items`);
  });

  it("reads every act of a long instruction, not the first eight", () => {
    const items = Array.from({ length: 12 }, (_unused, index) => `Save the item number ${index + 1} to my saved items.`);
    const acts = automationStudioInstructedActs(items.join(" "));
    expect(acts.map((act) => act.id)).toEqual(items.map((_item, index) => `a${index + 1}`));
    expect(acts.every((act) => act.kind === "save")).toBe(true);
  });

  it("gives each act its own clause, not the whole sentence", () => {
    const acts = automationStudioInstructedActs("Save every job Halvard Systems has posted to my saved jobs, and then open my saved jobs so the list is showing.");
    expect(acts.map((act) => act.quote)).toEqual(["Save every job Halvard Systems has posted to my saved jobs", "open my saved jobs so the list is showing"]);
  });

  it("keeps coordinated verbs over one object as one act", () => {
    const acts = automationStudioInstructedActs("Collect and use that store's coupon, and pay with my saved Visa card.");
    expect(acts.map((act) => [act.kind, act.verb])).toEqual([["claim", "collect"]]);
  });

  it("does not split objects that are not each counted", () => {
    expect(automationStudioInstructedActs("Add the kettle and the toaster to my cart.").map((act) => act.kind)).toEqual(["add_to"]);
  });

  it("reads nothing from nothing", () => {
    expect(automationStudioInstructedActs("")).toEqual([]);
    expect(automationStudioInstructedActs(undefined as unknown as string)).toEqual([]);
  });
});

// Lane D's run 2 (`run-munnop9n-5475d593`): "confirm everyone I have at least
// five mutual friends with" was answered by one Confirm. An act over every
// member of a set is marked, so a step that acts once is not taken for it.
describe("an act asked for every member of a set", () => {
  const PLURAL: Record<string, string[]> = {
    "job board save week": ["save"],
    "auction watch endings": ["add"],
    "social confirm requests": ["confirm"],
    "professional withdraw": ["withdraw"]
  };

  it.each(CONSEQUENTIAL)("marks exactly the acts over a whole set in %s", (label, instruction) => {
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.filter((act) => act.plural).map((act) => act.verb)).toEqual(PLURAL[label] ?? []);
    for (const act of acts) if (!act.plural) expect(act).not.toHaveProperty("plural");
  });

  it.each([
    ["each, all, every and everyone", ["Confirm all pending requests.", "Withdraw each request I sent in August.", "Withdraw each of the invitations.", "Save everything in the results to my saved items.", "Clip every coupon for this store.", "Confirm everyone who sent me a request this week."]]
  ])("reads %s as a whole set", (_label, instructions) => {
    for (const instruction of instructions) expect(automationStudioInstructedActs(instruction).map((act) => act.plural), instruction).toEqual([true]);
  });

  it.each([
    ["a price each", "Buy one at $30 each."],
    ["all and a count", "Add all three kettles to my cart."],
    ["a product name", "Add the ValueRidge All-Purpose Cleaner to my cart."],
    ["a quantifier well after the object", "Save the cheapest table for sale within five miles of every station to my saved items."],
    ["an act of opening", "Open my saved items and list everything in my saved items."],
    ["a setting", "Sort all results by price."]
  ])("does not read %s as a whole set", (_label, instruction) => {
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.some((act) => act.plural)).toBe(false);
  });
});

// A build reads its instruction as title, newline, body, and a title restates
// the task. Read as a second save, it could never be given a step of its own.
describe("an instruction's title", () => {
  it("gives way to the body asking for the same act", () => {
    const acts = automationStudioInstructedActs("Save cheap tables\nSave the three cheapest dining tables for sale within 5 miles of Kelford to my saved items.");
    expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "save"]]);
    expect(acts[0]?.quote.startsWith("Save the three cheapest")).toBe(true);
  });

  it("still counts when it is the only place the act is asked for", () => {
    expect(automationStudioInstructedActs("Save cheap tables\nThe tables must be within 5 miles of Kelford.").map((act) => act.kind)).toEqual(["save"]);
  });
});

// Run 6 (`run-muncqlr0-3348202b`): one "add" over two counted products was
// read as one act quoting the whole sentence, so a Flow that added only the
// towels satisfied the check. Each product is its own act with its own quote.
describe("one verb over coordinated objects", () => {
  const RUN_6 = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";

  it("reads one act per counted object, each quoting its own", () => {
    const acts = automationStudioInstructedActs(RUN_6);
    expect(acts.map((act) => [act.id, act.kind, act.verb])).toEqual([["a1", "set", "switch"], ["a2", "add_to", "add"], ["a3", "add_to", "add"]]);
    const [store, towels, napkins] = acts.map((act) => act.quote);
    expect(store).toContain("Millbrook");
    expect(store).not.toContain("Paper Towels");
    expect(store).not.toContain("Napkins");
    expect(towels).toContain("Paper Towels");
    expect(towels).not.toContain("Napkins");
    expect(napkins).toContain("Napkins");
    expect(napkins).not.toContain("Paper Towels");
    expect(new Set(acts.map((act) => act.quote)).size).toBe(acts.length);
    expect(acts.some((act) => act.kind === "submit")).toBe(false);
  });
});
