// An ending is never cut inside a sentence (t193 round 1003). Live run
// `run-mustzxhi-2e2cda87` ended "... I tried 3 times live -- exploring, then 2
// repairs after testing what I had -- over 38 decisions. The Flow so far was
// kept as a draft, not put into the." -- its not-finished message, sliced to
// the ending's limit because its still-to-do list quoted four long acts
// nearly whole. Each ending that sliced its message is built here from inputs
// that long, and must fit with its closing sentences whole.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE } from "../../generation-failure/index.ts";
import type { AutomationStudioInstructedActChecklistItem } from "../../instructed-acts/index.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "../budget-exhausted.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapEndingFitted } from "../ending-fit.ts";
import { automationStudioFlowBootstrapJudgeWordsSaid } from "../judge-words.ts";
import { automationStudioFlowBootstrapKeptSaid } from "../kept-said.ts";
import { automationStudioFlowBootstrapNotDoable } from "../not-doable.ts";
import { automationStudioFlowBootstrapProgressAndTestSaid, automationStudioFlowBootstrapRepairingJudgedSaid } from "../not-done.ts";
import { automationStudioFlowBootstrapNotFinished } from "../not-finished.ts";
import { automationStudioFlowBootstrapRepliesUnreadable } from "../replies-unreadable.ts";

const MAX = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_BUILD_ENDING_MAX_MESSAGE;
const KEPT = automationStudioFlowBootstrapKeptSaid(true);

/** The run's six acts and choices: two with a step, four still to do, each quoted at length. */
const checklist: AutomationStudioInstructedActChecklistItem[] = [
  { id: "a1", verb: "switch", quote: "Switch my pickup store to Millbrook Crossing Supercenter", done: 2 },
  {
    id: "a2", verb: "add", todo: "no_step_added",
    quote: "add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size to my cart, the ones on the weekly deal",
    choices: [{ id: "a2.quantity", choice: "quantity", value: "two", quote: "two packs of the ValueRidge Essentials Select-A-Size Paper Towels, not the single rolls", todo: "quantity_is_a_repeat" }]
  },
  {
    id: "a3", verb: "add", todo: "no_step_added",
    quote: "add one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, whichever colour is in stock at that store",
    choices: [{ id: "a3.variant", choice: "variant", value: "250 Count", quote: "in the 250 Count size of the ValueRidge Everyday Dinner Napkins rather than the 100 Count one", todo: "no_step_added" }]
  },
  { id: "a4", verb: "open", quote: "open the cart", done: 9 }
];

const judgement = (over: Partial<AutomationStudioFlowBootstrapJudgement> = {}): AutomationStudioFlowBootstrapJudgement => ({
  round: 2, stopped: "iterations", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 9, done: 2, proven: 2,
  todo: ["a2", "a2.quantity", "a3", "a3.variant"], lastIssueCodes: [], flowSignature: "same", ...over
});

const long = (what: string) => `${what} ${"and the cart page showed the Paper Towels at one pack while the napkins were never added at all ".repeat(4)}`.trim();
const judgedNo = (over: Partial<AutomationStudioFlowBootstrapJudgedWrong> = {}): AutomationStudioFlowBootstrapJudgedWrong => ({
  verdict: "no", findings: ["result.acts_judged_undone"], observed: long("the test added one pack."), advice: long("press add twice."), expected: long("two packs."), ...over
});

describe("the not-finished ending of run-mustzxhi-2e2cda87", () => {
  const ending = automationStudioFlowBootstrapNotFinished({
    judgement: judgement(), checklist, rounds: 3, decisions: 38, kept: true,
    stoodStill: { kind: "no_progress", before: judgement({ round: 1 }), rounds: 1 }
  });

  // The same sentences with all four quoted at their widest, as the ending said them before: over the limit, so the old slice cut the kept sentence.
  it("would overflow with every quote said at its widest", () => {
    const stood = ending.message.indexOf("2 of the 6 things you asked have a step that ran");
    const widest = automationStudioFlowBootstrapProgressAndTestSaid(checklist, judgement());
    const tried = "I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had.";
    expect(stood).toBeGreaterThan(0);
    expect(stood + widest.length + 1 + tried.length + 1 + KEPT.length).toBeGreaterThan(MAX);
  });

  it("fits, and keeps the kept-draft sentence whole at its end", () => {
    expect(ending.message.length).toBeLessThanOrEqual(MAX);
    expect(ending.message.endsWith(KEPT)).toBe(true);
    expect(ending.message).toContain("I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had.");
  });

  it("keeps what stood still and every fact: the count asked, the count still to do, the test", () => {
    expect(ending.message).toMatch(/^I have not finished this Flow yet\. My last attempt to fix it got no further than the one before: the Flow came out exactly the same, no more of what you asked has a step than before, and no more of its steps worked when it was run from the start\./u);
    expect(ending.message).toContain("2 of the 6 things you asked have a step that ran, or could run, when the Flow was run from its start; still to do: ");
    expect(ending.message).toMatch(/; and \d more\./u);
    expect(ending.message).toContain("The Flow as far as it got (9 steps) ran from its start, but it does not yet do all you asked.");
    expect(ending.notDone).toHaveLength(4);
  });

  it("fits with a judge's long words on both rounds, the kept sentence still whole", () => {
    const after = judgement({ stopped: "judged_wrong", judge: judgedNo({ advice: long("add a second press.") }) });
    const said = automationStudioFlowBootstrapNotFinished({
      judgement: after, checklist, rounds: 3, decisions: 38, kept: true,
      stoodStill: { kind: "no_progress", before: judgement({ round: 1, stopped: "judged_wrong", judge: judgedNo() }), rounds: 1 }
    }).message;
    expect(said.length).toBeLessThanOrEqual(MAX);
    expect(said.endsWith(KEPT)).toBe(true);
    expect(said).toContain("What the judge says is left to change: ");
  });
});

describe("the other endings that sliced their message", () => {
  it("not doable: fits, what was tried whole at its end", () => {
    const said = automationStudioFlowBootstrapNotDoable({
      judgement: judgement({ stopped: "judged_wrong", judge: judgedNo({ stillAchievable: "no" }) }), checklist, rounds: 3, decisions: 38, noRoute: { kind: "judged_unachievable" }
    }).message;
    expect(said.length).toBeLessThanOrEqual(MAX);
    expect(said).toMatch(/I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had, and the last attempt to fix it ended when the judge found that what you asked can no longer be done\.$/u);
    expect(said).toMatch(/^I could not build this Flow, and I found no way to: it was tested from its start and judged not to do what you asked/u);
    // Said once: the judge's account, never again in the test's own sentence (t264 S3).
    expect(said.match(/judged not to (?:do|be) what you asked/gu)).toHaveLength(1);
  });

  it("budget: fits, what was tried and the kept sentence with the Flow's ceiling whole at its end", () => {
    const said = automationStudioFlowBootstrapBudgetExhausted({
      bound: "cost", sizes: { maxCostUsd: 0.1 }, judgement: judgement({ stopped: "judged_wrong", judge: judgedNo() }), checklist, rounds: 3, decisions: 38, kept: true,
      spending: { spentUsd: 0.08, pendingUsd: 0, ceilingUsd: 0.1, judgedUsd: 0.004, carriedUsd: 0.02, projectedCostUsd: 0.03 }
    }).message;
    expect(said.length).toBeLessThanOrEqual(MAX);
    expect(said).toMatch(/I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had\. The steps I found so far were kept as a draft, so building again carries on from them\.$/u);
    // One money sentence (R2-U-2): what building this Flow has used of its limit.
    expect(said).toMatch(/^The build used its budget for this Flow before the Flow was finished\. Building this Flow has used \$0\.08 of its spending limit of \$0\.10, and what was left was too little to go on\. /u);
    // A Flow judged wrong is said so once, with how far it got, never again as what held it up (t264 S3).
    expect(said.match(/judged not to (?:do|be) what you asked/gu)).toHaveLength(1);
    expect(said).not.toContain("what held it up");
  });

  it("replies unreadable: fits, the kept sentence whole at its end", () => {
    const said = automationStudioFlowBootstrapRepliesUnreadable({
      unreadable: { inARow: 6, total: 8, cases: ["content_mismatched"], said: "its brackets did not match: one closed the wrong kind, or there was one too many or too few" },
      judgement: judgement(), checklist, rounds: 3, decisions: 38, kept: true
    }).message;
    expect(said.length).toBeLessThanOrEqual(MAX);
    expect(said.endsWith(KEPT)).toBe(true);
    expect(said).toMatch(/^The build stopped because the replies it got back could not be read: 6 in a row came back unreadable/u);
    // Three live rounds are said as every ending says them, before what was kept.
    expect(said).toContain("I worked on it live 3 times: first exploring the page, then fixing it twice after testing what I had. " + KEPT);
  });
});

describe("fitting an ending", () => {
  it("says it in the widest room that fits, and never cuts a closing sentence", () => {
    const rooms: number[] = [];
    const said = automationStudioFlowBootstrapEndingFitted((room) => {
      rooms.push(room.most);
      return { body: ["First.", "x".repeat(room.most * 30) + "."], close: ["Closing."] };
    }, 80);
    expect(rooms).toEqual([4, 3, 2]);
    expect(said).toBe(`First. ${"x".repeat(60)}. Closing.`);
  });

  it("as a last resort leaves out whole sentences of the body, then cuts the first at a sentence end", () => {
    const leftOut = automationStudioFlowBootstrapEndingFitted(() => ({ body: ["One. Two.", "y".repeat(200) + "."], close: ["Kept whole."] }), 40);
    expect(leftOut).toBe("One. Two. Kept whole.");
    const cut = automationStudioFlowBootstrapEndingFitted(() => ({ body: [`One. ${"z".repeat(200)}.`], close: ["Kept whole."] }), 40);
    expect(cut).toBe("One. Kept whole.");
  });
});

// A build ending is plain, whole and said once (t276, item 2).
//
// Live run `run-muw60unq-591e23bd` (U4) ended: "... 5 of the 5 things you asked
// have a step, no more than before, and this time the judge found: "End view
// shows ... No step select...". What the judge says is left to change: "Add a
// step after step 6 ... under Ships From (t958), ...". 5 of the 5 things you
// asked have a step that ran ...": a quote cut mid-word, a page handle, and one
// count said twice. Live run `run-muw6144a-e56f945d` (U9) ended: "... this time
// the judge found: "s8 kept only Amara Osei because its where requires the row
// text to equal ...". What the judge says is left to change: "Fix s8's where
// ... and fix s13 so...."": step ids, the draft's words, cut mid-sentence. The
// judge's words below are those runs' own (steps 0100-judge and 0127-judge).
// Folded in from plain-ending.test.ts (t276), scoped so its fixtures stay its own.
{
  const RUN_A_OBSERVED = "End view shows Space Grey marked, 7-in-1 marked, quantity 3, coupon \"Collected\", total 59,97 €, cart \"3 Cart\". But Ships From shows \"China\" marked; \"Spain\" is available and unmarked. No step selects Spain.";
  const RUN_A_ADVICE = "Add a step after step 6 (the 7-in-1 selection) to click the \"Spain\" option under Ships From (t958), before setting quantity and adding to cart, so the shipped-from-Spain variant is chosen.";
  const RUN_B_OBSERVED = "s8 kept only Amara Osei because its where requires the row text to equal \"Request accepted\"; the confirm loop s11 therefore ran on Amara Osei, Lin Zhao and Freya Holm, and the end view still shows Tom Becker, Priya Nair, Jonas Weber, Diego Alvarez and Marta Kowalczyk as pending with Confirm buttons, while Lin Zhao and Freya Holm were never confirmed. s13's output read also filters on \"Request accepted\" rather than on the accepted state of each request.";
  const RUN_B_ADVICE = "Fix s8's where so it keeps requests with at least five mutual friends (its mutualFriends pattern already matches 5+ but the second condition must not require the acceptance notice), and fix s13 so it reads the accepted requests in list order with name and mutualFriends as shown, not rows whose text equals \"Request accepted\".";

  /** Nothing a person was never shown: an id, a code, a draft word, a cut. */
  const RAW = /\b[sn]\d{1,5}\b|\b[adet]\d{2,6}\b|\(t\d+\)|\bwhere requires\b|\bits where\b|\bend view\b|\bnode\b|mutualFriends|[a-z]+_[a-z_]+\.[a-z_]+|\.\.\./u;

  const judgement = (over: Partial<AutomationStudioFlowBootstrapJudgement> = {}): AutomationStudioFlowBootstrapJudgement => ({
    round: 2, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 9, done: 5, proven: 5,
    todo: [], lastIssueCodes: [], flowSignature: "after", ...over
  });
  const judgedNo = (over: Partial<AutomationStudioFlowBootstrapJudgedWrong>): AutomationStudioFlowBootstrapJudgedWrong => ({ verdict: "no", findings: ["result.acts_judged_undone"], ...over });
  const act = (id: string, quote: string): AutomationStudioInstructedActChecklistItem => ({ id, verb: "add", quote, done: 3 });

  /** The sentences of a message, split where one ends. */
  const sentences = (message: string): string[] => message.split(/(?<=[.!?]["')]*)\s+/u);

  describe("run-muw60unq-591e23bd's ending (U4)", () => {
    const checklist = [act("a1", "put three Voltbay USB-C hubs in the cart"), act("a2", "Space Grey"), act("a3", "7-in-1"), act("a4", "shipped from Spain"), act("a5", "collect the store coupon")];
    const before = judgement({ round: 1, flowSignature: "before", judge: judgedNo({ observed: "Ships From shows China marked.", advice: "Click Spain under Ships From." }) });
    const after = judgement({ judge: judgedNo({ observed: RUN_A_OBSERVED, advice: RUN_A_ADVICE, findings: ["result.required_values_missing"] }) });
    const message = automationStudioFlowBootstrapNotFinished({ judgement: after, checklist, rounds: 3, decisions: 40, kept: true, stoodStill: { kind: "no_progress", before, rounds: 2 } }).message;

    it("says the count of what was asked once, never twice", () => {
      expect(message.match(/5 of the 5 things you asked/gu)).toHaveLength(1);
      expect(message).toContain("no more of what you asked has a step than before");
    });

    it("says the judge's words whole and plain: no handle, no cut, no quote marks round them", () => {
      expect(message).not.toMatch(RAW);
      expect(message).toContain("What the judge found this time: The page at the end shows Space Grey marked, 7-in-1 marked, quantity 3, coupon \"Collected\", total 59,97 €, cart \"3 Cart\". But Ships From shows \"China\" marked");
      expect(message).toContain("What the judge says is left to change: Add a step after step 6");
      expect(message).toContain("to click the \"Spain\" option under Ships From, before setting quantity");
      expect(message).not.toContain(": \"Add");
    });

    it("never says one sentence twice", () => {
      const said = sentences(message).map((sentence) => sentence.toLowerCase());
      expect(new Set(said).size).toBe(said.length);
    });
  });

  describe("run-muw6144a-e56f945d's ending (U9)", () => {
    const checklist = [act("a1", "confirm everyone I have at least five mutual friends with")];
    const before = judgement({ round: 1, done: 1, proven: 1, stepsInFlow: 8, flowSignature: "before", judge: judgedNo({ observed: "The accepted read kept none.", advice: "Read the accepted requests." }) });
    const after = judgement({ done: 1, proven: 1, stepsInFlow: 8, judge: judgedNo({ observed: RUN_B_OBSERVED, advice: RUN_B_ADVICE, findings: ["result.acts_on_wrong_rows"] }) });
    const message = automationStudioFlowBootstrapNotFinished({ judgement: after, checklist, rounds: 3, decisions: 40, kept: true, stoodStill: { kind: "no_progress", before, rounds: 2 } }).message;

    it("says no step id, no draft word and no cut", () => {
      expect(message).not.toMatch(RAW);
    });

    it("says what the judge found and what is left to change in whole plain sentences", () => {
      expect(message).toContain("What the judge found this time: A step kept only Amara Osei because its condition requires the row text to equal \"Request accepted\".");
      expect(message).toContain("What the judge says is left to change: Fix the step's condition so it keeps requests with at least five mutual friends.");
    });
  });

  describe("the judge's words, screened", () => {
    it("leaves out a handle in parentheses and says a step id after its noun as the noun", () => {
      expect(automationStudioFlowBootstrapJudgeWordsSaid(RUN_A_ADVICE, 400)).toBe(RUN_A_ADVICE.replace(" (t958)", ""));
      expect(automationStudioFlowBootstrapJudgeWordsSaid("the confirm loop s11 ran on Lin Zhao.", 200)).toBe("the confirm loop ran on Lin Zhao.");
    });

    it("says whole sentences up to the room, then the opening clauses of a first that does not fit, else nothing", () => {
      expect(automationStudioFlowBootstrapJudgeWordsSaid(RUN_A_OBSERVED, 160)).toBe("The page at the end shows Space Grey marked, 7-in-1 marked, quantity 3, coupon \"Collected\", total 59,97 €, cart \"3 Cart\". But Ships From shows \"China\" marked.");
      expect(automationStudioFlowBootstrapJudgeWordsSaid(RUN_A_ADVICE, 120)).toBe("Add a step after step 6 to click the \"Spain\" option under Ships From, before setting quantity and adding to cart.");
      expect(automationStudioFlowBootstrapJudgeWordsSaid("x ".repeat(100), 60)).toBe("");
    });

    it("says nothing of a bare code", () => {
      expect(automationStudioFlowBootstrapJudgeWordsSaid("result.acts_judged_undone", 200)).toBe("");
    });
  });

  describe("every ending that quotes the judge", () => {
    const judge = judgedNo({ observed: RUN_B_OBSERVED, advice: RUN_B_ADVICE, expected: "Confirm every request (t12) with at least five mutual friends." });
    const checklist = [act("a1", "confirm everyone I have at least five mutual friends with")];

    it("not doable: plain, whole, and no dash before what the judge said", () => {
      const message = automationStudioFlowBootstrapNotDoable({ judgement: judgement({ judge: { ...judge, stillAchievable: "no" } }), checklist, rounds: 2, decisions: 20, noRoute: { kind: "judged_unachievable" } }).message;
      expect(message).not.toMatch(RAW);
      expect(message).not.toMatch(/ -- [A-Z"]/u);
      expect(message).toContain("What its test did: A step kept only Amara Osei");
    });

    it("budget: plain and whole", () => {
      // The judge's words are said where its reserve was spent judging the Flow.
      const message = automationStudioFlowBootstrapBudgetExhausted({
        bound: "cost", sizes: { maxCostUsd: 0.1 }, judgement: judgement({ judge }), checklist, rounds: 3, decisions: 30, kept: true,
        spending: { spentUsd: 0.08, pendingUsd: 0, ceilingUsd: 0.1, judgedUsd: 0.004 }
      }).message;
      expect(message).not.toMatch(RAW);
      expect(message).toContain("What is left to change: Fix the step's condition");
    });

    it("the repair's heading: plain and whole", () => {
      const heading = automationStudioFlowBootstrapRepairingJudgedSaid(judge);
      expect(heading).not.toMatch(RAW);
      expect(heading).toBe("The Flow was tested from its start and judged not to do what you asked: A step kept only Amara Osei because its condition requires the row text to equal \"Request accepted\". Repairing it live.");
    });
  });

  describe("fitting an ending", () => {
    it("never says a sentence twice", () => {
      expect(automationStudioFlowBootstrapEndingFitted(() => ({ body: ["The Flow ran.", "It saved 3 rows. the flow ran."], close: ["Kept."] }), 200)).toBe("The Flow ran. It saved 3 rows. Kept.");
    });
  });
}

// R2-U-3 (`run-muwansvz-a2b4a987`, judge 0026): the judge's sentence was cut
// inside "(e.g." and the next sentence glued on ("(e.g. Repairing it live.").
describe("the judge's words are cut only at whole sentences", () => {
  const judged = "Stored rows include sponsored items (e.g. Sponsored earbuds, Ivory 3.6). Add filter conditions for rating and price.";

  it("never ends inside an aside or after an abbreviation", () => {
    for (const most of [60, 120, 200, 400]) {
      const said = automationStudioFlowBootstrapJudgeWordsSaid(judged, most);
      expect(said).not.toMatch(/\(e\.g\.?$/u);
      expect((said.match(/\(/gu) ?? []).length).toBe((said.match(/\)/gu) ?? []).length);
    }
  });

  it("keeps the aside whole when it fits", () => {
    expect(automationStudioFlowBootstrapJudgeWordsSaid(judged, 400)).toContain("(e.g. Sponsored earbuds, Ivory 3.6).");
  });
});
