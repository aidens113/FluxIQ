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
import { describe, expect, it } from "vitest";
import type { AutomationStudioInstructedActChecklistItem } from "../../instructed-acts/index.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "../budget-exhausted.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong, AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapEndingFitted } from "../ending-fit.ts";
import { automationStudioFlowBootstrapJudgeWordsSaid } from "../judge-words.ts";
import { automationStudioFlowBootstrapNotDoable } from "../not-doable.ts";
import { automationStudioFlowBootstrapRepairingJudgedSaid } from "../not-done.ts";
import { automationStudioFlowBootstrapNotFinished } from "../not-finished.ts";

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
    expect(message).toContain("What the judge says is left to change: Fix the step's condition");
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
