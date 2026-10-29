import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioExploredToggleTie } from "../toggle-tie.ts";
import { automationStudioFlowPlanToggleSteps, type AutomationStudioExploredToggle } from "../toggle-idempotent.ts";

// t792: a toggle a trial pass learned is tied to the step written as the
// trial's node was -- its parameters, compared whole -- never to whichever step
// now has that node's key. A repair that inserts or removes an earlier step
// renumbers every later one (`s2` becomes `s3`). The controls are generic: a
// saved-notes list whose rows each have a "Pin" and a "Star" button.

const NODE = "domain.demo.press";
const PIN = { target: { selector: "#note-3 .pin" } };
const STAR = { target: { selector: "#note-3 .star" } };
const OPEN = { target: { selector: "#note-3 .title" } };
const PINNED = { via: "name", gains: ["unpin"], loses: ["pin"] };
const STARRED = { via: "name", gains: ["unstar"], loses: ["star"] };

/** One subflow, `primary`, keyed `s1`, `s2`, ... in order, as a script's steps are. */
function plan(steps: readonly JsonObject[]): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Run", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", edges: [],
      nodes: steps.map((parameters, index) => ({ key: `s${index + 1}`, definitionId: NODE, definitionVersion: "1.0.0", consequences: ["modify_existing"], parameters: structuredClone(parameters) })) }]
  } as AutomationStudioFlowBootstrapPlan;
}

/** A trial's press of the step keyed `key`, written with `parameters`, as `../../explored-toggles.ts` records it. */
const trialPress = (key: string, parameters: JsonObject, signature: JsonObject): AutomationStudioExploredToggle => ({
  node: NODE, handles: [], trialNodes: [`node.bootstrap.b1.primary.${key}`], trialParameters: structuredClone(parameters), signature
});

/** Each step's `ensureState`, by key; a step given none is absent. */
function ensured(steps: readonly JsonObject[], explored: readonly AutomationStudioExploredToggle[]): Record<string, unknown> {
  const result = automationStudioFlowPlanToggleSteps({ plan: plan(steps), explored });
  expect(result.issues).toEqual([]);
  return Object.fromEntries(result.plan.subflows[0]!.nodes.flatMap((node) => node.parameters?.ensureState === undefined ? [] : [[node.key, node.parameters.ensureState]]));
}

describe("a toggle a trial learned, tied to its step by identity (t792)", () => {
  it("stays on the right step when a revision inserts an earlier step", () => {
    // The trial ran [Pin] as s1; the repair writes [Open, Pin], so the Pin step is s2 and s1 is another control.
    expect(ensured([OPEN, PIN], [trialPress("s1", PIN, PINNED)])).toEqual({ s2: PINNED });
  });

  it("stays on the right step when a revision removes an earlier step", () => {
    // The trial ran [Open, Pin]; the repair drops Open, so Pin is s1 and nothing is s2.
    expect(ensured([PIN], [trialPress("s2", PIN, PINNED)])).toEqual({ s1: PINNED });
  });

  it("never swaps two controls' signatures when their steps trade places", () => {
    const explored = [trialPress("s1", PIN, PINNED), trialPress("s2", STAR, STARRED)];
    expect(ensured([STAR, PIN], explored)).toEqual({ s1: STARRED, s2: PINNED });
    // A step on a control no trial pressed, at a key one did, gets nothing.
    expect(ensured([OPEN, OPEN], explored)).toEqual({});
  });

  it("keeps the tie of an identical step renumbered, and gives a changed step none", () => {
    expect(ensured([OPEN, STAR, OPEN, PIN], [trialPress("s2", PIN, PINNED)])).toEqual({ s4: PINNED });
    // Pin written with another target is another step, whatever its key.
    expect(ensured([{ target: { selector: "#note-4 .pin" } }], [trialPress("s1", PIN, PINNED)])).toEqual({});
  });

  it("decides by key only between steps written the same, and never sees Core's ensureState as part of a step", () => {
    // The trial's node was s3, written with the ensureState an earlier revision was given.
    const explored = [trialPress("s3", { ...PIN, ensureState: PINNED }, PINNED)];
    expect(ensured([PIN, OPEN, PIN], explored)).toEqual({ s3: PINNED });
    // Only one Pin left: it is that step though its key moved.
    expect(ensured([OPEN, PIN], explored)).toEqual({ s2: PINNED });
  });

  it("ties no step to a trial press recorded without its node's parameters, and no exploration call to any trial press", () => {
    const unknown: AutomationStudioExploredToggle = { node: NODE, handles: [], trialNodes: ["node.bootstrap.b1.primary.s1"], signature: PINNED };
    expect(ensured([PIN], [unknown])).toEqual({});
    expect(automationStudioExploredToggleTie({ node: NODE, handles: new Set(), target: PIN.target }, [trialPress("s1", PIN, PINNED)])).toBeUndefined();
  });
});

// t792: a toggle's words change with its state, so a repair that looked after the trial's press names the
// control by its other state's words. Only the words this press's own signature recorded count.
describe("a toggle a trial learned, tied to a step that names the control in its other state (t792)", () => {
  const LIKE = { control: { name: "Like", at: "#post-3 .like", classes: ["like-button"] } };
  const LIKED = { via: "name", gains: ["unlike"], loses: ["like"] };
  const SAVE = { control: { name: "Save post", at: "#post-3 .save" } };
  const SAVED = { via: "name", gains: ["saved"], loses: ["save"] };
  const named = (control: JsonObject) => ({ control: { ...LIKE.control, ...control } });

  it("keeps the tie when the repair writes the control with its other state's words", () => {
    expect(ensured([OPEN, named({ name: "Unlike" })], [trialPress("s1", LIKE, LIKED)])).toEqual({ s2: LIKED });
    expect(ensured([{ control: { name: "Saved post", at: "#post-3 .save" } }], [trialPress("s4", SAVE, SAVED)])).toEqual({ s1: SAVED });
    // A class list that gained the state's word, by a signature told by classes.
    const pressed = { via: "class", gains: ["is-active"], loses: [] };
    expect(ensured([named({ classes: ["like-button", "is-active"] })], [trialPress("s1", LIKE, pressed)])).toEqual({ s1: pressed });
  });

  it("never ties two different controls whose words happen to match another toggle's signature", () => {
    const explored = [trialPress("s1", LIKE, LIKED), trialPress("s2", SAVE, SAVED)];
    // The Like control written with the Save toggle's words, another row's Like, and text that changed by more than the state.
    expect(ensured([named({ name: "Saved" }), named({ name: "Unlike", at: "#post-4 .like" }), named({ name: "Unlike 13" })], explored)).toEqual({});
    // A signature with no words (a stated attribute) allows no difference at all.
    expect(ensured([named({ name: "Unlike" })], [trialPress("s1", LIKE, { via: "attribute", attribute: "aria-pressed", to: true })])).toEqual({});
  });

  it("ties the press to the step written as the trial's was, never to a later press back in the other state's words", () => {
    expect(ensured([LIKE, named({ name: "Unlike" })], [trialPress("s1", LIKE, LIKED)])).toEqual({ s1: LIKED });
  });
});
