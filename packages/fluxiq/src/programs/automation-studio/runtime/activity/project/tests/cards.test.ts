// The four project cards, built from the project-agent contracts' own
// fixtures: what each says in the chat, and that no digest reaches a title,
// a ref or a card.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brief, builderReturn, structurePlan, taskSpec } from "../../../project-agents/tests/fixtures.ts";
import { runWithAutomationStudioActivityAgent } from "../../agent.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";
import {
  automationStudioProjectCardWords,
  emitAutomationStudioProjectBriefCard,
  emitAutomationStudioProjectPlanCard,
  emitAutomationStudioProjectReceiptCard,
  emitAutomationStudioProjectReturnCard
} from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const DIGEST = /[a-f0-9]{32,}/iu;
const inBuild = (fn: () => void) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);

/** No digest anywhere a person or the extension reads: the label, the title, the ref, the text or the card. */
function expectNoDigest(event: ClientGatewayActivity): void {
  expect(event.label).not.toMatch(DIGEST);
  expect(event.detail?.title ?? "").not.toMatch(DIGEST);
  expect(event.detail?.ref ?? "").not.toMatch(DIGEST);
  expect(event.detail?.text ?? "").not.toMatch(DIGEST);
  expect(JSON.stringify(event.detail?.project ?? {})).not.toMatch(DIGEST);
}

describe("the plan card", () => {
  it("lists the parts in the person's words, each subflow's purpose and parts, the cases, the budget and the reserve", () => {
    const plan = structurePlan();
    inBuild(() => emitAutomationStudioProjectPlanCard({ taskSpec: taskSpec(), structurePlan: plan, briefs: [brief(undefined, plan)], purposes: { list_soups: "Read the newest soups" }, reserveUsd: 0.08 }));
    expect(seen).toHaveLength(1);
    const event = seen[0]!;
    expect(event.detail).toMatchObject({ kind: "note", title: "Plan: 2 parts in 2 subflows", status: "succeeded" });
    expect(event.detail?.ref).toBeUndefined();
    expect(event.detail?.project).toEqual({
      kind: "plan",
      parts: [{ id: "p1", words: "list the five newest soups" }, { id: "p2", words: "save the first one to my cookbook" }],
      subflows: [
        { key: "list_soups", name: "List soups", purpose: "Read the newest soups", parts: ["p1"] },
        { key: "save_recipe", name: "Save recipe", purpose: "save the first one to my cookbook", parts: ["p2"] }
      ],
      cases: [{ subflowKey: "save_recipe", caseId: "observed-current" }],
      budget: [{ subflowKey: "save_recipe", usd: 0.05 }],
      reserveUsd: 0.08
    });
    expectNoDigest(event);
  });

  it("leaves out cases and budget before any brief is written", () => {
    inBuild(() => emitAutomationStudioProjectPlanCard({ taskSpec: taskSpec(), structurePlan: structurePlan() }));
    expect(seen[0]!.detail?.project).not.toHaveProperty("cases");
    expect(seen[0]!.detail?.project).not.toHaveProperty("budget");
  });
});

describe("the brief card", () => {
  it("says what is being built and for what, with the brief id as its ref", () => {
    const plan = structurePlan();
    inBuild(() => emitAutomationStudioProjectBriefCard({ brief: brief(undefined, plan), structurePlan: plan, taskSpec: taskSpec() }));
    const event = seen[0]!;
    expect(event.phase).toBe("building");
    expect(event.detail).toMatchObject({ kind: "note", title: "Building Save recipe: save the first one to my cookbook", status: "started", ref: "b1" });
    expect(event.detail?.project).toEqual({
      kind: "brief", briefId: "b1", brief: "build", subflowKey: "save_recipe", subflowName: "Save recipe",
      purpose: "save the first one to my cookbook", caseId: "observed-current", allowanceUsd: 0.05
    });
    expectNoDigest(event);
  });

  it("says Repairing for a repair, in the repairing phase", () => {
    const plan = structurePlan();
    const repair = brief((value) => Object.assign(value, { kind: "repair", failingReceipt: { kind: "subflow_trial", receiptId: "receipt.1", digest: "c".repeat(64) } }), plan);
    inBuild(() => emitAutomationStudioProjectBriefCard({ brief: repair, structurePlan: plan, taskSpec: taskSpec(), purpose: "Fix the save button" }));
    expect(seen[0]!.phase).toBe("repairing");
    expect(seen[0]!.detail?.title).toBe("Repairing Save recipe: Fix the save button");
    expectNoDigest(seen[0]!);
  });
});

describe("the return card", () => {
  it("says how the brief ended, with the reason, spend, calls and a count of trials (never their digests)", () => {
    inBuild(() => emitAutomationStudioProjectReturnCard({ returned: builderReturn(), brief: brief(), structurePlan: structurePlan() }));
    const event = seen[0]!;
    expect(event.detail).toMatchObject({ kind: "note", title: "Save recipe: done", status: "succeeded", ref: "b1", text: "The recipe saves and its trial answered yes." });
    expect(event.detail?.project).toEqual({ kind: "return", briefId: "b1", subflowKey: "save_recipe", outcome: "done", reason: "The recipe saves and its trial answered yes.", spentUsd: 0.02, calls: 5, trials: 1 });
    expectNoDigest(event);
  });

  it("says partly done or blocked, and hides a digest the builder's reason quoted", () => {
    const quoted = `It stopped at revision ${"d".repeat(64)}.`;
    inBuild(() => {
      emitAutomationStudioProjectReturnCard({ returned: builderReturn((value) => Object.assign(value, { outcome: "partial", reason: quoted })), brief: brief() });
      emitAutomationStudioProjectReturnCard({ returned: builderReturn((value) => Object.assign(value, { outcome: "blocked" })), brief: brief() });
    });
    expect(seen.map((event) => [event.detail?.title, event.detail?.status])).toEqual([["save_recipe: partly done", undefined], ["save_recipe: blocked", "failed"]]);
    expect(seen[0]!.detail?.text).toBe("It stopped at revision ….");
    for (const event of seen) expectNoDigest(event);
  });
});

describe("the receipt card", () => {
  it("names a subflow trial and its verdict without its digest", () => {
    const [trial] = builderReturn().trials;
    inBuild(() => emitAutomationStudioProjectReceiptCard({ receipt: trial!, verdict: "passed", briefId: "b1", subflowName: "Save recipe" }));
    const event = seen[0]!;
    expect(event.phase).toBe("verifying");
    expect(event.detail).toMatchObject({ kind: "note", title: "Subflow trial passed: Save recipe", status: "succeeded", ref: "b1" });
    expect(event.detail?.project).toEqual({ kind: "receipt", briefId: "b1", receipt: "subflow_trial", receiptId: "receipt.1", verdict: "passed" });
    expectNoDigest(event);
  });

  it("names the judged whole run, with no brief, and an unconfirmed verdict as a failure", () => {
    inBuild(() => emitAutomationStudioProjectReceiptCard({ receipt: { kind: "candidate_trial", receiptId: "receipt.9", digest: "e".repeat(64) }, verdict: "unconfirmed" }));
    expect(seen[0]!.detail).toMatchObject({ title: "Whole-Flow trial could not be confirmed", status: "failed" });
    expect(seen[0]!.detail?.ref).toBeUndefined();
    expect(seen[0]!.detail?.project).toEqual({ kind: "receipt", receipt: "candidate_trial", receiptId: "receipt.9", verdict: "unconfirmed" });
  });
});

describe("cards in an agent frame", () => {
  it("carry the supervisor as their agent", () => {
    inBuild(() => runWithAutomationStudioActivityAgent({ role: "supervisor" }, () => emitAutomationStudioProjectPlanCard({ taskSpec: taskSpec(), structurePlan: structurePlan() })));
    expect(seen[0]!.agent).toEqual({ role: "supervisor" });
  });
});

describe("card words", () => {
  it("collapse whitespace, hide digest-shaped runs and cut to the bound", () => {
    expect(automationStudioProjectCardWords(`  a\n b ${"0".repeat(40)} c `, 160)).toBe("a b … c");
    expect(automationStudioProjectCardWords("x".repeat(10), 5)).toBe("xxxx…");
  });
});
