// The build's test, a rerun's put-back and a part run all check a step that
// does one of the person's lasting acts rather than press it again, whatever it
// declared (`../../../flow-draft/verify-only.ts`: lanes A and D's rule, which
// lane B's task G merged into on 2026-10-03; the acts come from the
// instruction's read, `lastingActs`).
//
// Live run `run-murwdp4f-35f976d2`: d12 Add to cart carried act a2 and declared
// `consequences: []`, so both build tests pressed it and the person's cart went
// from 2 to 3 to 4 items. The site below counts every Add to cart press.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { runAutomationStudioFlowDraftPart, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioNodeRerunFromItsPlace, replayAutomationStudioFlowDraft } from "../index.ts";

const HOME = { location: "https://store.test/" };
const TOWELS = { location: "https://store.test/p/towels" };
const CART = { location: "https://store.test/cart" };

const step = (position: number, node: string, from: JsonObject, acts?: string[]): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences: [] },
  ranWith: { node, parameters: {}, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  stateBefore: `state-${position}`,
  replay: { from },
  ...(acts ? { acts } : {})
});

/** Open the towels, choose the size, Add to cart (a2), "+" (a2.quantity): every step declared nothing lasting. */
const DRAFT = [
  step(1, "node.open_towels", HOME),
  step(2, "node.size", TOWELS, ["a2.size"]),
  step(3, "node.add_to_cart", TOWELS, ["a2"]),
  step(4, "node.plus", TOWELS, ["a2.quantity"])
];

/** The instruction's read: a2, "add ... to my cart", lasts. */
const LASTING: ReadonlySet<string> = new Set(["a2"]);

/** A site whose cart grows with every Add to cart that is pressed, never with one that is checked. */
function site() {
  const calls: { callId: string; value: JsonObject }[] = [];
  const state = { cart: 2 };
  const answer = (code: string, effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult =>
    ({ kind: "llm_evidence_tool_execution", evidence: { said: code, cart: state.cart }, effectApplied, resultCode: code });
  const executeTool = async ({ callId, value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    if (value.replay === "reset") return answer("core.replay.replayed", true);
    if (value.replay === "verify") return answer("core.replay.verified", false);
    if (value.node === "node.add_to_cart") state.cart += 1;
    return answer("core.replay.replayed", true);
  };
  return { calls, state, executeTool, sent: (node: string) => calls.filter((each) => each.value.node === node).map((each) => each.value.replay) };
}

describe("a step that does one of the person's acts, in the build's test", () => {
  it("checks a lasting candidate without turning checked parameters into performed proof", async () => {
    const draft = structuredClone(DRAFT);
    const performed = structuredClone(draft[2]!);
    draft[2]!.input = { ...draft[2]!.input, parameters: { target: "replacement", person: { $input: "person", test: "Tom" } } };
    draft[2]!.ranWith = { ...draft[2]!.input };
    draft[2]!.effectApplied = false;
    draft[2]!.checkedCandidate = { callId: "check", code: "core.replay.verified" };
    draft[2]!.priorExecution = { ...performed, lasting: true };
    delete draft[2]!.stateBefore;
    const { state, executeTool, sent } = site();
    const result = await replayAutomationStudioFlowDraft({ steps: draft, attempt: 1, executeTool, lastingActs: LASTING });
    expect(result.verdict.ok).toBe(true);
    expect(sent("node.add_to_cart")).toEqual(["verify"]);
    expect(state.cart).toBe(2);
    expect(draft[2]!.effectApplied).toBe(false);
    expect(draft[2]!.priorExecution?.input).toEqual(performed.input);
    expect(draft[2]).not.toHaveProperty("written");
    expect(draft[2]).not.toHaveProperty("stateBefore");
  });

  it("is checked and not pressed, and the steps around it are run again", async () => {
    const { state, executeTool, sent } = site();
    const replayed = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, executeTool, lastingActs: LASTING });
    expect(sent("node.add_to_cart")).toEqual(["verify"]);
    expect(sent("node.plus")).toEqual(["step"]);
    expect(sent("node.size")).toEqual(["step"]);
    expect(state.cart).toBe(2);
    expect(replayed.verdict.ok).toBe(true);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 3)).toMatchObject({ status: "replayed", mode: "verify", resultCode: "core.replay.verified" });
  });

  it("is checked too when the next step found the target on another page: a lasting act is never pressed twice", async () => {
    const moves = [step(1, "node.open_towels", HOME), step(2, "node.add_to_cart", TOWELS, ["a2"]), step(3, "node.read_cart", CART)];
    const { state, executeTool, sent } = site();
    await replayAutomationStudioFlowDraft({ steps: moves, attempt: 1, executeTool, lastingActs: LASTING });
    expect(sent("node.add_to_cart")).toEqual(["verify"]);
    expect(state.cart).toBe(2);
  });

  it("is pressed by its declaration alone when the build has no read of the instruction", async () => {
    const { state, executeTool, sent } = site();
    await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, executeTool });
    expect(sent("node.add_to_cart")).toEqual(["step"]);
    expect(state.cart).toBe(3);
  });
});

describe("a step that does one of the person's acts, in a rerun's put-back", () => {
  it("is checked rather than done again before the rerun", async () => {
    const { state, executeTool, sent } = site();
    const place = await automationStudioNodeRerunFromItsPlace({ step: DRAFT[3]!, steps: DRAFT, now: undefined, callId: "c9", executeTool, lastingActs: LASTING });
    expect(place).toMatchObject({ kind: "put_back", startPage: "step" });
    expect(sent("node.add_to_cart")).toEqual(["verify"]);
    expect(state.cart).toBe(2);
    expect(place.kind === "put_back" ? place.doneAgain.map((each) => [each.step, each.outcome]) : []).toEqual([[2, "replayed"], [3, "verified"]]);
  });
});

describe("a step that does one of the person's acts, in a part run", () => {
  it("is checked and not pressed", async () => {
    const { state, executeTool, sent } = site();
    const ran = await runAutomationStudioFlowDraftPart({ steps: DRAFT, value: { from: 2, to: 4 }, callId: "c7", executeTool, lastingActs: LASTING });
    expect(sent("node.add_to_cart")).toEqual(["verify"]);
    expect(state.cart).toBe(2);
    expect((ran.evidence as JsonObject).passed).toBe(true);
  });
});
