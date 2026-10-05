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
import { automationStudioFlowBootstrapKeptSaid } from "../kept-said.ts";
import { automationStudioFlowBootstrapNotDoable } from "../not-doable.ts";
import { automationStudioFlowBootstrapProgressAndTestSaid } from "../not-done.ts";
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
    expect(ending.message).toMatch(/^I have not finished this Flow yet\. My last attempt to fix it got no further than the one before: the Flow came out exactly the same, 2 of the 6 things you asked have a step, no more than before, and no more of its steps worked when it was run from the start\./u);
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
    expect(said).toContain("What the judge says is left to change: \"");
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
    expect(said).toMatch(/I explored live 3 times over 38 decisions[^.]*\. The Flow so far was kept as a draft, not put into the Flow, and building again carries on from it, with \$0\.020 left of this Flow's \$0\.10\.$/u);
    expect(said).toMatch(/^The build stopped at its spending limit of \$0\.10 before the Flow was finished: /u);
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
    expect(said).toMatch(/^The build stopped because the model's replies could not be read: 6 in a row came back unreadable/u);
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
