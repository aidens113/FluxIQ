// t799 (P6, F5): a step pressing a control the domain says is stateful never
// flips it back (`../toggle-idempotent.ts`).
//
// - A looped step tied by a trial press carries `ensureState` on its node, so
//   every pass of the loop is held to it, from the revision after its first
//   trial, through the record a real trial's attempts leave
//   (`../../explored-toggles.ts`).
// - A step resolved from a handle whose view showed a stateful control
//   (CC9, `control.ensures`) is given it though the build never pressed it;
//   an explored or trial press decides first.
// - A press that named `idempotentWith` gives a node that takes `ensureState`
//   its idempotent form instead of a refusal.
// - With no `control` on any view, the output is what it was.
//
// The stand-in is a reading list: each book row's "mark as read" control.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import type { AutomationStudioPlanControlState } from "../../../llm/harness-options/index.ts";
import { AutomationStudioExploredToggles } from "../../explored-toggles.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "../loop-body.ts";
import { automationStudioFlowPlanToggleSteps, type AutomationStudioExploredToggle } from "../toggle-idempotent.ts";

const PRESS = "domain.demo.press";
const READ = { state: "opaque.read" };
const UNREAD = { state: "opaque.unread" };
const ROW_MARK = { target: { selector: "$row.mark" } };

type Step = { key: string; definitionId?: string; consequences?: string[]; parameters?: JsonObject };

/** A plan of `steps`, chained; `loop` names a For Each over the books whose body is the chain and joins back to it. */
function plan(steps: Step[], loop?: string): AutomationStudioFlowBootstrapPlan {
  const nodes = [...(loop ? [{ key: loop, definitionId: "builtin.control.for-each" }] : []), ...steps].map((node) => ({ definitionId: PRESS, definitionVersion: "1.0.0", ...node }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: index === 0 && loop ? "item" : "success" }, target: { nodeKey: node.key, portId: "in" } }));
  if (loop && nodes.length > 1) edges.push({ key: "back", source: { nodeKey: nodes.at(-1)!.key, portId: "success" }, target: { nodeKey: loop, portId: "in" } });
  return {
    schemaVersion: "0.1",
    router: { name: "Mark", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }]
  } as AutomationStudioFlowBootstrapPlan;
}

const parametersOf = (result: { plan: AutomationStudioFlowBootstrapPlan }) => Object.fromEntries(result.plan.subflows[0]!.nodes.map((node) => [node.key, node.parameters]));

/** One pass of a trial's attempt of `nodeId`, answering `toggle` (or skipped, already in its state). */
function pass(nodeId: string, index: number, toggle: JsonObject | "skipped"): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: `a${index}`, nodeId, definitionId: PRESS, startedAt: index, status: "succeeded", inputs: {}, effects: [],
    outputs: toggle === "skipped" ? {} : { toggle: { signature: toggle } },
    ...(toggle === "skipped" ? { skipped: { reason: "already_in_state", code: "already_in_state" } } : {})
  } as unknown as AutomationStudioNodeAttemptTrace;
}

describe("a looped step tied by a trial press", () => {
  const trialNode = "node.bootstrap.b1.primary.s2";

  it("carries ensureState on its node, the first pass's signature, so every pass of the loop is held to it", () => {
    const first = plan([{ key: "s2", consequences: ["modify_existing"], parameters: ROW_MARK }], "s1");
    expect(automationStudioFlowPlanLoopBody(first.subflows[0]!, "s1")).toEqual(new Set(["s2"]));
    // The first trial of the loop: four passes, the second over a book already read (a reversal), the third pressed alike again.
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([pass(trialNode, 1, READ), pass(trialNode, 2, UNREAD), pass(trialNode, 3, READ), pass(trialNode, 4, READ)], { nodes: [{ id: trialNode, parameterValues: ROW_MARK }] });
    expect(toggles.list().map((press) => press.signature)).toEqual([READ, UNREAD]);
    // The next revision, an earlier step inserted so the looped step's key moved: still the same step, and only it.
    const next = plan([{ key: "s2", consequences: ["modify_existing"], parameters: { target: { selector: "#shelf-filter" } } }, { key: "s3", consequences: ["modify_existing"], parameters: ROW_MARK }], "s1");
    const result = automationStudioFlowPlanToggleSteps({ plan: next, explored: toggles.list(), takesEnsureState: (id) => id === PRESS });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result)).toEqual({ s1: undefined, s2: { target: { selector: "#shelf-filter" } }, s3: { ...ROW_MARK, ensureState: READ } });
    expect(automationStudioFlowPlanLoopBody(result.plan.subflows[0]!, "s1").has("s3")).toBe(true);
  });

  it("keeps it on the revision after a trial that already held every pass to it", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([pass(trialNode, 1, READ)], { nodes: [{ id: trialNode, parameterValues: ROW_MARK }] });
    // The trial of the tied revision: passes over books already read were skipped; the rest pressed to read.
    toggles.trial([pass(trialNode, 1, "skipped"), pass(trialNode, 2, READ), pass(trialNode, 3, "skipped")], { nodes: [{ id: trialNode, parameterValues: { ...ROW_MARK, ensureState: READ } }] });
    expect(toggles.list()).toHaveLength(1);
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "s2", consequences: ["modify_existing"], parameters: { ...ROW_MARK, ensureState: UNREAD } }], "s1"), explored: toggles.list() });
    expect(parametersOf(result).s2).toEqual({ ...ROW_MARK, ensureState: READ });
  });
});

describe("a step resolved from a handle whose view showed a stateful control (CC9)", () => {
  const stateful = (control: Partial<AutomationStudioPlanControlState> = {}): AutomationStudioPlanControlState => ({ stateful: true, state: "unread", ensures: READ, ...control });
  const step = (consequences = ["modify_existing"]) => plan([{ key: "mark", consequences, parameters: { target: { selector: "#book-3 .read" } } }]);
  const view = (control?: AutomationStudioPlanControlState, handle = "t4") => ({ node: "primary.mark", handle, ...(control ? { control } : {}) });

  it("is given the view's ensures as ensureState though the build never pressed the control", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: step(), handleViews: [view(stateful())], explored: [], takesEnsureState: () => true });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result).mark).toEqual({ target: { selector: "#book-3 .read" }, ensureState: READ });
  });

  it("ties last: an explored press of the handle, or a trial press of the step, decides first", () => {
    const explored: AutomationStudioExploredToggle = { node: PRESS, handles: ["t4"], signature: UNREAD };
    const trial: AutomationStudioExploredToggle = { node: PRESS, handles: [], trialNodes: ["node.bootstrap.b1.primary.mark"], trialParameters: { target: { selector: "#book-3 .read" } }, signature: UNREAD };
    for (const press of [explored, trial]) {
      expect(parametersOf(automationStudioFlowPlanToggleSteps({ plan: step(), handleViews: [view(stateful())], explored: [press] })).mark, JSON.stringify(press)).toEqual({ target: { selector: "#book-3 .read" }, ensureState: UNREAD });
    }
  });

  it("ties nothing where its node cannot take ensureState, where its views disagree or name no ensures, or where it is not exactly modify_existing; and never refuses", () => {
    const cases = [
      { plan: step(), handleViews: [view(stateful({ idempotentWith: "domain.demo.set_state" }))], takesEnsureState: () => false },
      { plan: step(), handleViews: [view(stateful()), view(stateful({ ensures: UNREAD }), "t5")] },
      { plan: step(), handleViews: [view({ stateful: true, state: "unread" })] },
      { plan: step(["modify_existing", "delete"]), handleViews: [view(stateful())] },
      { plan: step([]), handleViews: [view(stateful())] }
    ];
    for (const input of cases) {
      const result = automationStudioFlowPlanToggleSteps({ ...input, explored: [] });
      expect(result.issues, JSON.stringify(input.handleViews)).toEqual([]);
      expect(result.plan, JSON.stringify(input.handleViews)).toEqual(input.plan);
    }
  });

  it("is held to the agreeing views of the step alone, never another step's", () => {
    const two = plan([
      { key: "mark", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" } } },
      { key: "open", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .open" } } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({ plan: two, handleViews: [view(stateful()), view(stateful(), "t4b"), { node: "primary.open", handle: "t6" }], explored: [] });
    expect(parametersOf(result)).toEqual({ mark: { target: { selector: "#book-3 .read" }, ensureState: READ }, open: { target: { selector: "#book-3 .open" } } });
  });
});

describe("a press that named a node that sets the state", () => {
  const press: AutomationStudioExploredToggle = { node: PRESS, handles: ["t4"], signature: READ, idempotentWith: "domain.demo.set_state" };
  const step = (definitionId = PRESS) => plan([{ key: "mark", definitionId, consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" } } }]);
  const handleViews = [{ node: "primary.mark", handle: "t4" }];

  it("gives a node that takes ensureState its idempotent form instead of refusing it", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: step(), handleViews, explored: [press], takesEnsureState: (id) => id === PRESS });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result).mark).toEqual({ target: { selector: "#book-3 .read" }, ensureState: READ });
  });

  it("still refuses one that cannot take it, naming the node, in words that name no site", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: step(), handleViews, explored: [press], takesEnsureState: () => false });
    expect(result.issues).toMatchObject([{ code: "candidate.toggle_not_idempotent", path: "plan.subflows.0.nodes.0" }]);
    expect(result.issues[0]!.message).toContain("node domain.demo.set_state");
    expect(result.issues[0]!.message).not.toMatch(/\b(?:books?|read|unread|shelf|library|like|save)\b/iu);
  });
});

describe("with no control on any view", () => {
  it("leaves a plan no press ties exactly as it was, ensureState the model wrote taken off as before", () => {
    const input = plan([
      { key: "mark", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" } } },
      { key: "shelve", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .shelf" }, ensureState: READ } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({ plan: input, handleViews: [{ node: "primary.mark", handle: "t4" }, { node: "primary.shelve", handle: "t5" }], explored: [], takesEnsureState: () => true });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result)).toEqual({ mark: { target: { selector: "#book-3 .read" } }, shelve: { target: { selector: "#book-3 .shelf" } } });
  });
});
