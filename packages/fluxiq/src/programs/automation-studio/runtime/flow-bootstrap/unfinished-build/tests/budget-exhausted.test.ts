// What a budget ending says was kept, and how much it says worked (t193 R2-C3,
// live run `run-murzln6g-11debe1d`): "The Flow so far was kept" beside a Flow
// the chat then called empty, and "5 of the 6 things you asked worked" right
// before "what it did was judged not to be what you asked".
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "../budget-exhausted.ts";

const checklist = [
  { id: "a1", verb: "switch", quote: "switch my pickup store", done: 1 },
  { id: "a2", verb: "add", quote: "add two packs", done: 3 }
];

const judgedNo: AutomationStudioFlowBootstrapJudgement = {
  round: 1, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 13, done: 2, proven: 2, todo: [], lastIssueCodes: [],
  judge: { verdict: "no", findings: ["the cart holds one pack"], observed: "the cart holds one pack" }
};

const told = { bound: "cost" as const, sizes: { maxCostUsd: 0.1 }, judgement: judgedNo, checklist, rounds: 1, decisions: 30, spending: { spentUsd: 0.089, pendingUsd: 0, ceilingUsd: 0.1 } };

describe("a budget ending", () => {
  it("says the steps found so far were kept as a draft, never that the Flow is empty", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: true }).message;
    expect(message).toContain("The steps I found so far were kept as a draft, so building again carries on from them.");
    expect(message).not.toContain("empty");
  });

  it("says nothing was kept when nothing was", () => {
    expect(automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: false }).message).toContain("Nothing was kept to carry on from.");
  });

  it("never says worked of a Flow judged not to do what was asked", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: true }).message;
    // "I worked on it live" is what was tried, said of the build, not of what the Flow does.
    expect(message.replace("I worked on it live", "")).not.toContain("worked");
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (13 steps) was run from its start, but the Flow was judged not to do what you asked.");
    expect(message.match(/not to do what you asked|not to be what you asked/gu)).toHaveLength(1);
  });
});

// t193 round 1003 (w9, w6): the merged progress-and-test sentence, and a split
// judge said as what it means in a build, never "the run is not marked as failed".
describe("a budget ending after a judge that did not settle it", () => {
  const disagreed = "This result was checked twice with the same evidence, and the answers differed. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.";
  const unsure: AutomationStudioFlowBootstrapJudgement = { ...judgedNo, stopped: "budget", judge: { verdict: "unknown", findings: [disagreed] } };

  it("says not judged once, with the step count in the progress sentence", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, judgement: unsure, spending: { ...told.spending, judgedUsd: 0.01 }, kept: true }).message;
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (13 steps) was run from its start, but the Flow was not judged to do what you asked.");
    expect(message).not.toContain("what it did was not judged");
  });

  it("says the build cannot finish on the split, never that the run is not failed", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, judgement: unsure, spending: { ...told.spending, judgedUsd: 0.01 }, kept: true }).message;
    expect(message).toContain("Its last check could not confirm it: This result was checked twice with the same evidence, and the answers differed. Since they disagree, the build cannot finish on this test.");
    expect(message).not.toContain("not marked as failed");
  });
});

// R2-U-2 (live run `run-muwansvz-a2b4a987`, moment 08): the ending was the purse's arithmetic --
// "its next call could have cost up to $0.008, more than was left beside the $0.014 kept back for
// judging the Flow, and that was not spent, because the Flow was unchanged since the judge said ...,
// and it had spent $0.079 ($0.000 of it by earlier builds of this Flow) in all" -- with "Step 8",
// "dedup" and "the judge" in it, and never said what blocked the fix: the repair's last seven tries
// were each turned down, the read's list named by a handle that did not say which list (0034, then
// the same refusal again at 0039 and 0046), or a rerun of the request already refused (0036, 0041,
// 0043, 0048). Its rows are replayed below by shape; no page value.
describe("a budget ending after a repair whose every try was turned down (R2-U-2)", () => {
  const READ = "web.output.dom-extract_list";
  const rejectedRead = (iteration: number, reason: string) => ({ iteration, decision: "tool_call" as const, callId: "rerun.5", toolId: "core.run_node", nodeId: READ, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", resultReason: reason });
  const rerunAsked = (iteration: number) => ({ iteration, decision: "amend_draft" as const, toolId: "core.flow_draft", amended: 1 });
  const rerunRefused = (iteration: number) => ({ iteration, decision: "amend_draft" as const, toolId: "core.flow_draft", amended: 0, amendmentsRefused: [{ step: 5, reason: "changes_nothing" as const }] });
  const lastRound = [
    { iteration: 30, decision: "tool_call" as const, callId: "c30", toolId: "core.run_node", nodeId: "web.output.dom-click", effectApplied: true, resultCode: "web.action.succeeded" },
    rerunAsked(31),
    { iteration: 32, decision: "tool_call" as const, callId: "rerun.5.place", toolId: "core.run_node", effectApplied: true, resultCode: "web.action.succeeded" },
    rejectedRead(34, "malformed_handle"),
    rerunRefused(36), rerunAsked(38), rejectedRead(39, "answered_the_same_again"),
    rerunRefused(41), rerunRefused(43), rerunAsked(45), rejectedRead(46, "answered_the_same_again"), rerunRefused(48),
    { iteration: 49, decision: "complete" as const }, { iteration: 51, decision: "complete" as const }
  ];
  const judgedWrong: AutomationStudioFlowBootstrapJudgement = {
    round: 1, stopped: "budget", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 5, done: 1, proven: 1, todo: [], lastIssueCodes: [],
    judge: {
      verdict: "no",
      findings: ["Step 8 kept 82 rows from 5 pages with no filtering or dedup."],
      observed: "Step 8 kept 82 rows from 5 pages with no filtering or dedup. Stored rows include sponsored items (e.g. ads) the judge says should go.",
      advice: "Step 8 needs filter conditions for sponsored items, rating and price."
    }
  };
  const ending = automationStudioFlowBootstrapBudgetExhausted({
    bound: "cost", sizes: { maxCostUsd: 0.1 }, judgement: judgedWrong, checklist: [{ id: "a1", verb: "find", quote: "find every pair of wireless earbuds", done: 1 }],
    rounds: 2, decisions: 51, kept: true, lastRound,
    spending: { spentUsd: 0.079, pendingUsd: 0, projectedCostUsd: 0.008, carriedUsd: 0, keptBackUsd: 0.014, ceilingUsd: 0.1, unchangedSinceJudgedNo: true }
  }).message;

  it("says the build used its budget for this Flow, in one money sentence", () => {
    expect(ending).toMatch(/^The build used its budget for this Flow before the Flow was finished\. Building this Flow has used \$0\.08 of its spending limit of \$0\.10, and what was left was too little to go on\. /u);
    expect(ending.match(/\$/gu)).toHaveLength(2);
  });

  it("says what blocked the last fix, from the round's own tries", () => {
    expect(ending).toContain("I worked on it live twice: first exploring the page, then fixing it once after testing what I had. What blocked the last fix: it was tried 7 times, and each time the step did not say which list on the page to read, or it was the same as a try already made, so it was not run again.");
  });

  it("says the check's account in a person's words, and no internal word", () => {
    expect(ending).toContain("Its last check found: A step kept 82 rows from 5 pages with no filtering or removing duplicates.");
    expect(ending).toContain("What is left to change: A step needs filter conditions for sponsored items, rating and price.");
    for (const word of ["next call", "the judge", "The judge", "kept back", "earlier builds", "Step 8", "dedup"]) expect(ending).not.toContain(word);
    // An aside is said whole or not at all: never cut at "(e.g." with the next sentence glued on.
    expect(ending).not.toMatch(/\(e\.g\.[^)]*(?:[.!?]\s|$)/u);
  });

  it("closes with what was kept, whole", () => {
    expect(ending).toMatch(/The steps I found so far were kept as a draft, so building again carries on from them\.$/u);
  });
});
