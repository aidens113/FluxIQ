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

describe("an observed toggle needs the instruction's explicit state choice", () => {
  it("refuses mixed first-already-satisfied passes instead of choosing first or majority", () => {
    const explored = [
      { signature: UNREAD, beforeSignature: READ },
      { signature: READ, beforeSignature: UNREAD },
      { signature: READ, beforeSignature: UNREAD }
    ].map((states) => ({ node: PRESS, handles: [], trialNodes: ["node.bootstrap.b1.primary.s2"], trialParameters: ROW_MARK, ...states }));
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "s2", consequences: ["modify_existing"], parameters: ROW_MARK }], "s1"), explored });
    expect(result.issues).toMatchObject([{ code: "candidate.toggle_state_required", path: "plan.subflows.0.nodes.1" }]);
    expect(parametersOf(result).s2).toEqual(ROW_MARK);
  });

  it("preserves an explicitly selected shown state before the first press", () => {
    const control = { stateful: true, shown: READ, ensures: UNREAD } as AutomationStudioPlanControlState;
    const result = automationStudioFlowPlanToggleSteps({
      plan: plan([{ key: "mark", consequences: ["modify_existing"], parameters: { ...ROW_MARK, ensureState: READ } }]),
      handleViews: [{ node: "primary.mark", handle: "t4", control }], explored: []
    });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result).mark).toEqual({ ...ROW_MARK, ensureState: READ });
  });
});

/** One pass of a trial's attempt of `nodeId`, answering `toggle` (or skipped, already in its state). */
function pass(nodeId: string, index: number, toggle: JsonObject | "skipped"): AutomationStudioNodeAttemptTrace {
  return {
    attemptId: `a${index}`, nodeId, definitionId: PRESS, startedAt: index, status: "succeeded", inputs: {}, effects: [],
    outputs: toggle === "skipped" ? {} : { toggle: { signature: toggle, beforeSignature: toggle === READ ? UNREAD : READ } },
    ...(toggle === "skipped" ? { skipped: { reason: "already_in_state", code: "already_in_state" } } : {})
  } as unknown as AutomationStudioNodeAttemptTrace;
}

describe("a looped step tied by a trial press", () => {
  const trialNode = "node.bootstrap.b1.primary.s2";

  it("carries the explicitly chosen ensureState on the loop body node across renumbering", () => {
    const first = plan([{ key: "s2", consequences: ["modify_existing"], parameters: ROW_MARK }], "s1");
    expect(automationStudioFlowPlanLoopBody(first.subflows[0]!, "s1")).toEqual(new Set(["s2"]));
    // The first trial of the loop: four passes, the second over a book already read (a reversal), the third pressed alike again.
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([pass(trialNode, 1, READ), pass(trialNode, 2, UNREAD), pass(trialNode, 3, READ), pass(trialNode, 4, READ)], { nodes: [{ id: trialNode, parameterValues: ROW_MARK }] });
    expect(toggles.list().map((press) => press.signature)).toEqual([READ, UNREAD]);
    // The next revision, an earlier step inserted so the looped step's key moved: still the same step, and only it.
    const next = plan([{ key: "s2", consequences: ["modify_existing"], parameters: { target: { selector: "#shelf-filter" } } }, { key: "s3", consequences: ["modify_existing"], parameters: { ...ROW_MARK, ensureState: READ } }], "s1");
    const result = automationStudioFlowPlanToggleSteps({ plan: next, explored: toggles.list(), takesEnsureState: (id) => id === PRESS });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result)).toEqual({ s1: undefined, s2: { target: { selector: "#shelf-filter" } }, s3: { ...ROW_MARK, ensureState: READ } });
    expect(automationStudioFlowPlanLoopBody(result.plan.subflows[0]!, "s1").has("s3")).toBe(true);
  });

  it("keeps a revision's explicit choice instead of inheriting an earlier revision's direction", () => {
    const toggles = new AutomationStudioExploredToggles();
    toggles.trial([pass(trialNode, 1, READ)], { nodes: [{ id: trialNode, parameterValues: ROW_MARK }] });
    // The trial of the tied revision: passes over books already read were skipped; the rest pressed to read.
    toggles.trial([pass(trialNode, 1, "skipped"), pass(trialNode, 2, READ), pass(trialNode, 3, "skipped")], { nodes: [{ id: trialNode, parameterValues: { ...ROW_MARK, ensureState: READ } }] });
    expect(toggles.list()).toHaveLength(1);
    const result = automationStudioFlowPlanToggleSteps({ plan: plan([{ key: "s2", consequences: ["modify_existing"], parameters: { ...ROW_MARK, ensureState: UNREAD } }], "s1"), explored: toggles.list() });
    expect(parametersOf(result).s2).toEqual({ ...ROW_MARK, ensureState: UNREAD });
    expect(result.issues).toEqual([]);
  });
});

describe("a step resolved from a handle whose view showed a stateful control (CC9)", () => {
  const stateful = (control: Partial<AutomationStudioPlanControlState> = {}): AutomationStudioPlanControlState => ({ stateful: true, state: "unread", shown: UNREAD, ensures: READ, ...control });
  const step = (consequences = ["modify_existing"]) => plan([{ key: "mark", consequences, parameters: { target: { selector: "#book-3 .read" }, ensureState: READ } }]);
  const view = (control?: AutomationStudioPlanControlState, handle = "t4") => ({ node: "primary.mark", handle, ...(control ? { control } : {}) });

  it("grounds its explicit choice in the view though the build never pressed the control", () => {
    const result = automationStudioFlowPlanToggleSteps({ plan: step(), handleViews: [view(stateful())], explored: [], takesEnsureState: () => true });
    expect(result.issues).toEqual([]);
    expect(parametersOf(result).mark).toEqual({ target: { selector: "#book-3 .read" }, ensureState: READ });
  });

  it("combines matching press evidence with views without overriding the explicit choice", () => {
    const explored: AutomationStudioExploredToggle = { node: PRESS, handles: ["t4"], signature: UNREAD };
    const trial: AutomationStudioExploredToggle = { node: PRESS, handles: [], trialNodes: ["node.bootstrap.b1.primary.mark"], trialParameters: { target: { selector: "#book-3 .read" } }, signature: UNREAD };
    for (const press of [explored, trial]) {
      expect(parametersOf(automationStudioFlowPlanToggleSteps({ plan: step(), handleViews: [view(stateful())], explored: [press] })).mark, JSON.stringify(press)).toEqual({ target: { selector: "#book-3 .read" }, ensureState: READ });
    }
  });

  it("refuses conflicting pairs and unreadable stateful controls", () => {
    const cases = [
      { plan: step(), handleViews: [view(stateful()), view(stateful({ ensures: UNREAD }), "t5")] },
      { plan: step(), handleViews: [view({ stateful: true, state: "unread" })] }
    ];
    for (const input of cases) {
      const result = automationStudioFlowPlanToggleSteps({ ...input, explored: [] });
      expect(result.issues, JSON.stringify(input.handleViews)).toHaveLength(1);
      expect(parametersOf(result).mark).toEqual({ target: { selector: "#book-3 .read" } });
    }
  });

  it("preserves a registered explicit setter and the existing no-ensureState path on a stateful target", () => {
    for (const definitionId of ["domain.demo.set_state", PRESS]) {
      const input = plan([{ key: "mark", definitionId, consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" }, checked: true } }]);
      const result = automationStudioFlowPlanToggleSteps({ plan: input, handleViews: [view(stateful({ idempotentWith: "domain.demo.set_state" }))], explored: [], takesEnsureState: () => false });
      expect(result.issues).toEqual([]);
      expect(result.plan).toEqual(input);
    }
  });

  it("is held to the agreeing views of the step alone, never another step's", () => {
    const two = plan([
      { key: "mark", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" }, ensureState: READ } },
      { key: "open", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .open" } } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({ plan: two, handleViews: [view(stateful()), view(stateful(), "t4b"), { node: "primary.open", handle: "t6" }], explored: [] });
    expect(parametersOf(result)).toEqual({ mark: { target: { selector: "#book-3 .read" }, ensureState: READ }, open: { target: { selector: "#book-3 .open" } } });
  });
});

describe("a press that named a node that sets the state", () => {
  const press: AutomationStudioExploredToggle = { node: PRESS, handles: ["t4"], signature: READ, idempotentWith: "domain.demo.set_state" };
  const step = (definitionId = PRESS) => plan([{ key: "mark", definitionId, consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" }, ensureState: READ } }]);
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
  it("leaves ordinary presses alone and refuses an unobserved explicit state", () => {
    const input = plan([
      { key: "mark", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .read" } } },
      { key: "shelve", consequences: ["modify_existing"], parameters: { target: { selector: "#book-3 .shelf" }, ensureState: READ } }
    ]);
    const result = automationStudioFlowPlanToggleSteps({ plan: input, handleViews: [{ node: "primary.mark", handle: "t4" }, { node: "primary.shelve", handle: "t5" }], explored: [], takesEnsureState: () => true });
    expect(result.issues).toMatchObject([{ code: "candidate.toggle_state_unobserved", path: "plan.subflows.0.nodes.1" }]);
    expect(parametersOf(result)).toEqual({ mark: { target: { selector: "#book-3 .read" } }, shelve: { target: { selector: "#book-3 .shelf" } } });
  });
});
