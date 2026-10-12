// A Flow written as a script, repaired: its undeclared steps and the steps its
// failed run never reached are run by the test as saved, and its optional
// notice step is passed over when the notice is absent (t439).
//
// Live run `run-mv4912r9-53b05a51` (R4a attempt 3): the saved Flow declared
// consequences on its presses only, as Core's script format tells the model,
// and left its navigate, check and type undeclared. A scheduled candidate was
// minted only for a declared node with a captured start, and the failed
// playback never started the nodes after the one it failed at, so the
// completion gate listed the navigate, the type and the last press for a live
// rerun; the domain refused each for its missing declaration, and repair never
// completed. In round 2 it also listed the optional "close the notice if it
// shows" step while no notice stood on the page, and the model, made to run it,
// pressed an unrelated account control. The fixture in
// `./carried-steps-as-saved.test.ts` declares every node, which hid all of this;
// this one declares the presses alone, as a script does.
//
// Supervisor review of t439 kept two limits. A saved step whose node must
// declare (a press) and did not is never run blind in a test: the permission
// gate is asked about an action from its declaration, so it is listed to be
// rerun with one. And a change to the optional step that the test never
// exercised is not saved: the step goes back to its saved version, and the
// person is told.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioFlowBootstrapJudgeUnfinished, automationStudioFlowBootstrapStepsNotRunInThisBuild } from "../../../flow-bootstrap/unfinished-build/index.ts";
import { automationStudioFlowDraftKeepSavedUntestedEdits, automationStudioFlowDraftReplayable, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioFlowDraftCopyScheduledCandidate } from "../../../flow-draft/scheduled-candidate/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import {
  automationStudioFlowDraftDryRunGate,
  automationStudioFlowDraftSeedFromFlow,
  replayAutomationStudioFlowDraft,
  type AutomationStudioFlowDraftReplayInput
} from "../../../llm/node-tools/index.ts";

const CATALOGUE = "https://library.test/catalogue";
const MERGE = "builtin.control.merge";
const declared = { declaredConsequences: [] };
const node = (id: string, definitionId: string, parameterValues: JsonObject, metadata?: JsonObject): AutomationStudioFlowNode =>
  ({ id, definitionId, parameterValues, ...(metadata ? { metadata } : {}) });
const wire = (id: string, sourceNodeId: string, targetNodeId: string, sourcePortId?: string): AutomationStudioFlowEdge =>
  ({ id, sourceNodeId, targetNodeId, ...(sourcePortId ? { sourcePortId } : {}) });

/**
 * A script-authored Flow: open the catalogue, close the newsletter notice if
 * it shows (optional, joined at a Merge), tick Large print, type the copies,
 * press Reserve. Only the presses declare. The run being repaired failed at the
 * tick, so it captured no start for the type or the last press.
 */
function storedFlow(): { nodes: AutomationStudioFlowNode[]; edges: AutomationStudioFlowEdge[]; startPages: Record<string, JsonObject> } {
  return {
    nodes: [
      node("main.s1", "web.output.browser-navigate", { url: CATALOGUE, newTab: false }),
      node("main.s2", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Close" }, timeoutMs: 10000 }, declared),
      node("main.s3", MERGE, { mergeMode: "first" }),
      node("main.s4", "web.output.dom-check", { element: { tagName: "div", visibleText: "Large print", classNames: ["facet"] }, checked: true, timeoutMs: 10000 }),
      node("main.s5", "web.output.dom-type", { text: "3", element: { tagName: "input", accessibleName: "Copies" }, timeoutMs: 10000 }),
      node("main.s6", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Reserve" }, timeoutMs: 10000 }, declared)
    ],
    edges: [
      wire("e1", "main.s1", "main.s2"),
      wire("e2", "main.s2", "main.s3", "success"),
      wire("e3", "main.s2", "main.s3", "failed"),
      wire("e4", "main.s3", "main.s4"),
      wire("e5", "main.s4", "main.s5"),
      wire("e6", "main.s5", "main.s6")
    ],
    startPages: { "main.s1": { location: CATALOGUE }, "main.s2": { location: CATALOGUE }, "main.s4": { location: CATALOGUE } }
  };
}

/** The steps a round's loop starts from, renumbered, each copy keeping its scheduled candidate. */
function loopSeed(seed: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowDraftStep[] {
  return seed.map((step, index) => {
    const copy = { ...step, position: index + 1 };
    automationStudioFlowDraftCopyScheduledCandidate(step, copy);
    return copy;
  });
}

/** The web domain's rule, as its node definitions state it: a press declares, and a typing step that submits. */
const declarationRequired = (definitionId: string, parameters: JsonObject): boolean =>
  definitionId === "web.output.dom-click" || (definitionId === "web.output.dom-type" && parameters.submit === true);

const seedOf = (flow = storedFlow()) => automationStudioFlowDraftSeedFromFlow({ ...flow, declarationRequired });
const roundDraft = (): AutomationStudioFlowDraftStep[] => loopSeed(seedOf().steps);

const nodeOf: NonNullable<AutomationStudioFlowDraftReplayInput["nodeOf"]> = (id) => id === MERGE
  ? { inputs: [{ id: "branches" }], outputs: [] }
  : { inputs: [], outputs: [], outputAction: { required: true, fixed: id } };

const answer = (code: string, effectApplied: boolean): AutomationStudioLlmEvidenceToolExecutionResult =>
  ({ kind: "llm_evidence_tool_execution", evidence: { said: code }, effectApplied, resultCode: code });

/** A page with no newsletter notice: the Close press finds nothing, every other step runs. */
function host() {
  const calls: JsonObject[] = [];
  const executeTool = async ({ value }: { value: JsonObject }) => {
    calls.push(value);
    const element = (value.parameters as JsonObject | undefined)?.element as JsonObject | undefined;
    if (element?.accessibleName === "Close") return answer("core.replay.failed", false);
    return answer("core.replay.replayed", true);
  };
  return { calls, executeTool };
}

function gate(steps: AutomationStudioFlowDraftStep[], executeTool: AutomationStudioFlowDraftReplayInput["executeTool"], shown: JsonObject[] = []) {
  return automationStudioFlowDraftDryRunGate({
    enabled: true, requireRunnable: true, requireLibrarySteps: true, steps, executeTool, nodeOf,
    accountEvidence: () => 0, showEvidence: ({ value }) => { shown.push(value as JsonObject); }, targetMoved: () => undefined
  });
}

const callFor = (calls: readonly JsonObject[], definitionId: string, name: string): JsonObject | undefined =>
  calls.find((call) => call.node === definitionId && JSON.stringify(call.parameters).includes(name));

describe("a repaired script-authored Flow whose navigate, check and type declared nothing (run-mv4912r9-53b05a51)", () => {
  it("lists none of its unchanged steps as not run in this build", () => {
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(roundDraft())).toEqual([]);
    expect(automationStudioFlowDraftReplayable(roundDraft())).toBe(true);
  });

  it("is run whole by the test, each step as saved: no declaration added, no start for the steps the failed run never reached", async () => {
    const { calls, executeTool } = host();
    const shown: JsonObject[] = [];
    expect(await gate(roundDraft(), executeTool, shown)()).toBeUndefined();
    expect(shown).toEqual([]);
    const tick = callFor(calls, "web.output.dom-check", "Large print");
    expect(tick).toMatchObject({ replay: "step", from: { location: CATALOGUE }, parameters: { checked: true } });
    expect(Object.hasOwn(tick!, "consequences")).toBe(false);
    const typed = callFor(calls, "web.output.dom-type", "Copies");
    expect(typed).toMatchObject({ replay: "step", parameters: { text: "3" } });
    expect(Object.hasOwn(typed!, "from")).toBe(false);
    expect(Object.hasOwn(typed!, "consequences")).toBe(false);
    expect(callFor(calls, "web.output.dom-click", "Reserve")).toMatchObject({ replay: "step", consequences: [] });
    expect(Object.hasOwn(callFor(calls, "web.output.dom-click", "Reserve")!, "from")).toBe(false);
  });

  it("passes over the optional notice step when the notice is absent: excused as optional, never a failed step", async () => {
    const { executeTool } = host();
    const replay = await replayAutomationStudioFlowDraft({ steps: roundDraft(), attempt: 1, executeTool, nodeOf });
    expect(replay.verdict.ok).toBe(true);
    expect(replay.verdict.outcomes.find((outcome) => outcome.step === 2)).toMatchObject({ excused: "optional" });
  });

  it("never lists the optional notice step for a live rerun, even once it cannot run as saved", async () => {
    const steps = roundDraft();
    steps[1]!.input.parameters = { element: { tagName: "button", accessibleName: "No thanks" }, timeoutMs: 10000 };
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual([]);
    const { calls, executeTool } = host();
    const shown: JsonObject[] = [];
    expect(await gate(steps, executeTool, shown)()).toBeUndefined();
    expect(shown).toEqual([]);
    // Nothing is pressed in its name: the test sends nothing for it.
    expect(calls.some((call) => JSON.stringify(call.parameters ?? {}).includes("No thanks"))).toBe(false);
  });

  it("is tested when a round stops short, and the next round is told to rerun nothing", async () => {
    const { executeTool } = host();
    let tested = 0;
    const judged = await automationStudioFlowBootstrapJudgeUnfinished({
      round: 0, stopped: "unusable_decisions", steps: roundDraft(), lastIssueCodes: [],
      test: async (steps) => {
        tested += 1;
        return await gate(steps, executeTool)();
      },
      replayable: automationStudioFlowDraftReplayable, checklist: () => []
    });
    expect(judged.kind).toBe("judged");
    if (judged.kind !== "judged") return;
    expect(tested).toBe(1);
    expect(judged.judgement.tested).toBe("replayed_clean");
    expect(judged.judgement.notRunInThisBuild).toBeUndefined();
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(loopSeed(judged.seed))).toEqual([]);
  });
});

describe("a saved press that declared nothing (supervisor review of t439)", () => {
  it("is listed to be rerun with its declaration, and the test never runs it blind", async () => {
    const flow = storedFlow();
    flow.nodes[5] = node("main.s6", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Reserve" }, timeoutMs: 10000 });
    const steps = loopSeed(seedOf(flow).steps);
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual([6]);
    const { calls, executeTool } = host();
    const shown: JsonObject[] = [];
    const refused = await gate(steps, executeTool, shown)();
    expect(refused).toEqual({ issueCodes: ["llm_evidence_loop.full_run_required"] });
    expect(shown[0]).toMatchObject({ steps: [{ step: 6, replayed: "not_run_in_this_build" }] });
    expect(String(shown[0]!.instruction)).toMatch(/adding the consequences it would have/u);
    // Nothing was sent: not the press, and no step of the Flow either.
    expect(calls).toEqual([]);
  });

  it("passed over when optional, and never sent", async () => {
    const flow = storedFlow();
    flow.nodes[1] = node("main.s2", "web.output.dom-click", { element: { tagName: "button", accessibleName: "Close" }, timeoutMs: 10000 });
    const steps = loopSeed(seedOf(flow).steps);
    expect(automationStudioFlowBootstrapStepsNotRunInThisBuild(steps)).toEqual([]);
    const { calls, executeTool } = host();
    expect(await gate(steps, executeTool)()).toBeUndefined();
    expect(calls.some((call) => JSON.stringify(call.parameters ?? {}).includes("Close"))).toBe(false);
  });
});

describe("a change to the optional notice step the test never exercised (supervisor review of t439)", () => {
  const SAID = /^Kept the saved version of "Close"; the change could not be tested because the notice it is for did not appear when the Flow was tested\.$/u;
  const describe = ({ value }: { value: JsonObject }) => ({ target: JSON.stringify(value).includes("Close") ? "Close" : "My account" });

  /** The optional step rerun in its place on another control, as R4a's model did (t870), the replaced step at the end. */
  function rerunInPlace(): AutomationStudioFlowDraftStep[] {
    const steps = roundDraft();
    const input = { node: "web.output.dom-click", parameters: { target: { handle: "t870" } }, consequences: [] };
    const rerun: AutomationStudioFlowDraftStep = {
      position: 2, id: "d26", iteration: 41, callId: "rerun.2", actionId: "web.output.dom-click", toolId: "core.run_node", input, effect: "mutate",
      disposition: "kept", proposes: true, standsFor: "f2", routing: { kind: "optional" },
      ranWith: { node: "web.output.dom-click", parameters: { element: { tagName: "a", accessibleName: "My account" }, selector: "#account" }, consequences: [] },
      replay: { from: { location: CATALOGUE } }
    };
    const replaced = { ...steps[1]!, position: steps.length + 1, replacedBy: "d26", disposition: "taken" as const };
    steps[1] = rerun;
    steps.push(replaced);
    return steps;
  }

  it("goes back to its saved version when the test passed it over, and says so in plain words", async () => {
    const steps = rerunInPlace();
    const notice = host();
    // The account control is not there in the test either: the step is excused as optional.
    const executeTool = async ({ value }: { value: JsonObject }) => JSON.stringify(value).includes("account") ? answer("core.replay.failed", false) : await notice.executeTool({ value });
    expect(await gate(steps, executeTool)()).toBeUndefined();
    expect(steps[1]!.replayed?.status).not.toBe("replayed");
    const kept = automationStudioFlowDraftKeepSavedUntestedEdits({ steps, saved: seedOf().steps, describe });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.position).toBe(2);
    expect(kept[0]!.said).toMatch(SAID);
    expect(steps[1]).toMatchObject({ id: "f2", position: 2, routing: { kind: "optional" }, input: { parameters: { element: { accessibleName: "Close" } } } });
    expect(steps[1]!.ranWith).toBeUndefined();
  });

  it("goes back too when it was changed in place and the test could not send it at all", async () => {
    const steps = roundDraft();
    steps[1]!.input = { ...steps[1]!.input, parameters: { element: { tagName: "button", accessibleName: "No thanks" }, timeoutMs: 10000 } };
    expect(await gate(steps, host().executeTool)()).toBeUndefined();
    const kept = automationStudioFlowDraftKeepSavedUntestedEdits({ steps, saved: seedOf().steps, describe });
    expect(kept.map((each) => each.said)).toEqual(['Kept the saved version of "Close"; the change could not be tested because the test had no way to run the changed step.']);
    expect(steps[1]!.input).toMatchObject({ parameters: { element: { accessibleName: "Close" } } });
  });

  it("is kept when the test ran it and it held, and an unchanged optional step is left alone", async () => {
    const steps = rerunInPlace();
    expect(await gate(steps, host().executeTool)()).toBeUndefined();
    expect(steps[1]!.replayed?.status).toBe("replayed");
    expect(automationStudioFlowDraftKeepSavedUntestedEdits({ steps, saved: seedOf().steps, describe })).toEqual([]);
    expect(steps[1]!.id).toBe("d26");
    const unchanged = roundDraft();
    expect(await gate(unchanged, host().executeTool)()).toBeUndefined();
    expect(automationStudioFlowDraftKeepSavedUntestedEdits({ steps: unchanged, saved: seedOf().steps, describe })).toEqual([]);
  });
});
