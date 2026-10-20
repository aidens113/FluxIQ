import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, runAutomationStudioGraph, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioCandidateTrialFeedback, automationStudioCandidateTrialLandedActs } from "../index.ts";

// t462: the lasting acts a trial left on the site, numbered as the trial's feedback numbers its steps.

const press = (id: string, words: string, consequences?: unknown[]) => ({
  id, definitionId: "web.output.dom-click", label: `Press ${id}`,
  parameterValues: { target: { selector: `#${id}` }, element: { tagName: "button", visibleText: words } },
  ...(consequences ? { metadata: { declaredConsequences: consequences } } : {})
});

const graph = {
  nodes: [
    { id: "open", definitionId: "web.output.browser-navigate", parameterValues: { url: "http://shop.test/" } },
    { id: "loop", definitionId: "builtin.control.for-each", parameterValues: {} },
    press("add", "Add  item", ["create_new"]),
    press("pay", "Pay now", ["create_new", "move_money", "create_new"]),
    press("look", "Look", []),
    press("odd", "Odd", ["purchase"]),
    press("plain", "Plain")
  ]
} as unknown as AutomationStudioFlowArtifact;

let next = 0;
function attempt(nodeId: string, status: "succeeded" | "failed", extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  const definitionId = (graph.nodes as Array<{ id: string; definitionId: string }>).find((node) => node.id === nodeId)!.definitionId;
  return { attemptId: `a${++next}`, nodeId, definitionId, startedAt: next, status, inputs: {}, outputs: {}, effects: [], ...extra };
}
const trace = (attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioGraphExecutionTrace => ({ status: "failed", startedAt: 1, values: {}, effects: [], attempts });
const busy: NonNullable<AutomationStudioNodeAttemptTrace["failure"]> = { category: "action_failed", code: "press.busy", retryable: true, stage: "execution", effect: "unacted" };

describe("the lasting acts a trial landed", () => {
  it("counts a succeeded step that declared a lasting class, numbered as the feedback numbers it with retries folded and loop passes", () => {
    const run = trace([
      attempt("open", "succeeded"),
      attempt("loop", "succeeded", { route: "body", outputs: { item: { name: "one" } } }),
      attempt("add", "failed", { failure: busy }),
      attempt("add", "succeeded"),
      attempt("loop", "succeeded", { route: "body", outputs: { item: { name: "two" } } }),
      attempt("add", "succeeded"),
      attempt("loop", "succeeded", { route: "done" }),
      attempt("pay", "succeeded")
    ]);
    const acts = automationStudioCandidateTrialLandedActs(run, graph);
    expect(acts).toEqual([
      { step: 3, definitionId: "web.output.dom-click", label: "Press add", control: "Add item", consequences: ["create_new"] },
      { step: 5, definitionId: "web.output.dom-click", label: "Press add", control: "Add item", consequences: ["create_new"] },
      // Core's order, each once.
      { step: 7, definitionId: "web.output.dom-click", label: "Press pay", control: "Pay now", consequences: ["move_money", "create_new"] }
    ]);
    const { feedback } = automationStudioCandidateTrialFeedback.executionFailed({ code: "candidate.execution_incomplete", start: "reset", trace: run, graph });
    const listed = feedback.steps as JsonObject[];
    for (const act of acts) expect(listed[act.step - 1]).toMatchObject({ step: act.step, definitionId: act.definitionId, label: act.label, control: act.control, status: "succeeded" });
  });

  it("leaves out a failed, state-held or skipped step, and one that declared nothing lasting or no class Core knows", () => {
    const acts = automationStudioCandidateTrialLandedActs(trace([
      attempt("add", "failed", { failure: { category: "action_failed", code: "press.refused", retryable: false } }),
      attempt("pay", "failed", { stateHeld: { rung: "skip_satisfied_node", route: "success" }, failure: busy }),
      attempt("add", "succeeded", { skipped: { reason: "target_absent", code: "web.target.absent" } }),
      attempt("look", "succeeded"),
      attempt("odd", "succeeded"),
      attempt("plain", "succeeded")
    ]), graph);
    expect(acts).toEqual([]);
  });

  it("numbers every step, past the 40 the feedback lists", () => {
    const attempts = [...Array.from({ length: 45 }, () => attempt("open", "succeeded")), attempt("add", "succeeded")];
    expect(automationStudioCandidateTrialLandedActs(trace(attempts), graph)).toEqual([expect.objectContaining({ step: 46 })]);
  });

  it("answers nothing without a trace or a graph", () => {
    expect(automationStudioCandidateTrialLandedActs(undefined, graph)).toEqual([]);
    expect(automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded")]), undefined)).toEqual([]);
  });

  it("leaves out a step whose effect never appeared: its diff on the same page added and removed nothing, or its effect check found it not landed (t475)", () => {
    const empty = { stateRefs: { stateDiff: { changed: false, added: "", removed: "", locationChanged: false, documentChanged: false } } };
    const shown = { stateRefs: { stateDiff: { changed: true, added: "button \"Remove\"", removed: "", documentChanged: false } } };
    const moved = { stateRefs: { stateDiff: { changed: true, documentChanged: true } } };
    const acts = automationStudioCandidateTrialLandedActs(trace([
      attempt("add", "succeeded", empty),
      attempt("open", "succeeded"),
      attempt("add", "succeeded", { effectCheck: { result: "not_landed", checkedAt: 1 } }),
      attempt("open", "succeeded"),
      attempt("add", "succeeded", shown),
      attempt("open", "succeeded"),
      attempt("add", "succeeded", moved)
    ]), graph);
    expect(acts.map((act) => act.step)).toEqual([5, 7]);
  });

  // t593, A8 crossborder `run-mv8c76i3-61b9ca89`: a coupon press declared `none` and stayed collected for every later phase.
  it("answers a domain step that declared none and changed its own page as possibly lasting, with no classes; nothing else that declared none", () => {
    const shown = { stateRefs: { stateDiff: { changed: true, added: "text \"Collected\"", removed: "button \"Get coupons\"", documentChanged: false } } };
    const moved = { stateRefs: { stateDiff: { changed: true, added: "a new page", documentChanged: true } } };
    const acts = automationStudioCandidateTrialLandedActs(trace([
      attempt("look", "succeeded", shown),
      // Moved to another page, no diff traced, declared nothing at all, or not a press: none is answered.
      attempt("look", "succeeded", moved),
      attempt("look", "succeeded"),
      attempt("plain", "succeeded", shown),
      attempt("open", "succeeded", shown)
    ]), graph);
    expect(acts).toEqual([{ step: 1, definitionId: "web.output.dom-click", label: "Press look", control: "Look", consequences: [], possible: true }]);
  });
  // t598: a trial's act on a site with no start hook could never be undone by item, so a reset could only name it under cannotUndo.
  it("carries where its step's control sat and the items its own page showed new, off the step's state diff, on positive evidence only", () => {
    const diff = (items: JsonObject, extra: JsonObject = {}) => ({ stateRefs: { stateDiff: { added: "line Oat milk", removed: "", documentChanged: false, items, ...extra } } });
    const acts = automationStudioCandidateTrialLandedActs(trace([
      // An earlier step's page showed line:soap and line:jam: neither is one a later step created.
      attempt("open", "succeeded", diff({ before: [], after: ["line:soap", "line:jam"] })),
      attempt("add", "succeeded", diff({ before: ["line:soap"], after: ["line:soap", "line:jam", "line:oat-1"] }, { spot: { item: "card:oat", dialog: "drawer:cart" } })),
      // The page before listed no items: nothing is known absent, so nothing is created; the spot still holds.
      attempt("add", "succeeded", diff({ after: ["line:oat-2"] }, { spot: { item: "card:oat" } })),
      // Moved to another document: nothing it shows there is its own.
      attempt("add", "succeeded", diff({ before: [], after: ["line:oat-3"] }, { documentChanged: true, added: "a new page" })),
      // A malformed token makes the list unread; a malformed spot is no spot.
      attempt("add", "succeeded", diff({ before: [], after: ["line:oat-4", "not a token!"] }, { spot: { item: 7 } })),
      attempt("add", "succeeded", diff({ before: ["line:soap"], after: ["line:soap", "line:oat-5"] }))
    ]), graph);
    expect(acts.map(({ step, spot, created }) => ({ step, spot, created }))).toEqual([
      { step: 2, spot: { item: "card:oat", dialog: "drawer:cart" }, created: ["line:oat-1"] },
      { step: 3, spot: { item: "card:oat" }, created: undefined },
      { step: 4, spot: undefined, created: undefined },
      { step: 5, spot: undefined, created: undefined },
      { step: 6, spot: undefined, created: ["line:oat-5"] }
    ]);
    // Without a diff it is recorded as before, with neither.
    expect(automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded")]), graph)).toEqual([{ step: 1, definitionId: "web.output.dom-click", label: "Press add", control: "Add item", consequences: ["create_new"] }]);
  });

  // t719: an add pressed on a detail page sits in no item; what it and its page are about is what ties its undo in the basket to it.
  it("carries what its step's control and page are about, off the step's state diff, as opaque tokens only", () => {
    const diff = (spot: JsonObject) => ({ stateRefs: { stateDiff: { added: "text \"Added to basket\"", removed: "", documentChanged: false, spot } } });
    const acts = automationStudioCandidateTrialLandedActs(trace([
      attempt("add", "succeeded", diff({ subject: "s:seller", page: "s:kettle" })),
      attempt("add", "succeeded", diff({ item: "i:card", subject: "s:kettle" })),
      // Words are no token: a spot of words alone is no spot.
      attempt("add", "succeeded", diff({ subject: "a kettle, in words", page: 7 }))
    ]), graph);
    expect(acts.map(({ step, spot }) => ({ step, spot }))).toEqual([
      { step: 1, spot: { subject: "s:seller", page: "s:kettle" } },
      { step: 2, spot: { item: "i:card", subject: "s:kettle" } },
      { step: 3, spot: undefined }
    ]);
  });

  // t684, t679 open question 1: a part run through a Call Subflow step named no item, so its act could never be undone by one.
  it("names the item a called part's step made, though the call's own diff, listed before it, already shows it", () => {
    const withCall = { nodes: [...graph.nodes, { id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "keep" } }] } as unknown as AutomationStudioFlowArtifact;
    const diff = (before: string[], after: string[]) => ({ stateRefs: { stateDiff: { added: "line Oat milk", removed: "", documentChanged: false, items: { before, after } } } });
    const child = trace([attempt("add", "succeeded", diff(["line:soap"], ["line:soap", "line:oat"]))]);
    const call = { ...attempt("open", "succeeded", diff(["line:soap"], ["line:soap", "line:oat"])), nodeId: "call", definitionId: "builtin.control.call-subflow", subflowTarget: { subflowId: "keep", graphFlowId: "keep-graph", graphRevision: 1 }, childTrace: child };
    // The step after the call lists the part's line as shown before it: it made nothing new.
    const acts = automationStudioCandidateTrialLandedActs(trace([call, attempt("add", "succeeded", diff(["line:soap", "line:oat"], ["line:soap", "line:oat"]))]), withCall);
    expect(acts.map(({ step, created }) => ({ step, created }))).toEqual([{ step: 2, created: ["line:oat"] }, { step: 3, created: undefined }]);
  });

  // t598, t597 open question 3: Core's own nodes act on nothing outside the run.
  it("never answers a step of Core's own that acts on nothing outside the run, whatever it declared; a Core node that reaches outside is read as any step", () => {
    const core = {
      nodes: [
        { id: "wait", definitionId: "builtin.timing.wait", label: "Wait", parameterValues: { duration: 1 }, metadata: { declaredConsequences: ["create_new"] } },
        { id: "quiet", definitionId: "builtin.timing.wait", label: "Wait quietly", parameterValues: { duration: 1 }, metadata: { declaredConsequences: [] } },
        { id: "recorded", definitionId: "builtin.policy.action", label: "Recorded save", parameterValues: { outputId: "web.output.dom-click" }, metadata: { declaredConsequences: ["create_new"] } }
      ]
    } as unknown as AutomationStudioFlowArtifact;
    const changed = { stateRefs: { stateDiff: { added: "text \"Saved\"", removed: "", documentChanged: false } } };
    const ran = (nodeId: string, definitionId: string): AutomationStudioNodeAttemptTrace => ({ attemptId: `c${++next}`, nodeId, definitionId, startedAt: next, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...changed });
    const acts = automationStudioCandidateTrialLandedActs(trace([ran("wait", "builtin.timing.wait"), ran("quiet", "builtin.timing.wait"), ran("recorded", "builtin.policy.action")]), core);
    expect(acts).toEqual([{ step: 3, definitionId: "builtin.policy.action", label: "Recorded save", consequences: ["create_new"] }]);
  });
});


it("carries bounded opaque immediate collection witnesses into a trial act and rejects malformed ones", () => {
  const collection = { scope: "p:list", group: "g:page", subjects: ["s:document"], states: { "s:document": "v:two" } };
  const collections = { before: [collection], after: [{ ...collection, subjects: ["s:other"], states: { "s:other": "v:one" } }] };
  const run = (witness: JsonObject) => automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded", { stateRefs: { stateDiff: { added: ["moved"], removed: ["old"], collections: witness } } })]), graph)[0];
  expect(run(collections)?.collections).toEqual(collections);
  expect(run({ before: [{ ...collection, subjects: ["s:document", "s:document"] }], after: [collection] })?.collections).toBeUndefined();
  expect(run({ before: [collection], after: [{ ...collection, states: {} }] })?.collections).toBeUndefined();
});

// L1 reset settlement: the acted control's own place and state, and the state counts its page showed there around the step.
it("carries the spot's resource, place and state and the step's controls, and drops malformed controls while keeping the act", () => {
  const controls = { page: "p:page", before: { "v:off": 1 }, after: { "v:on": 1 } };
  const run = (extra: JsonObject) => automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded", { stateRefs: { stateDiff: { added: ["pressed"], removed: [], documentChanged: false, ...extra } } })]), graph)[0];
  const carried = run({ spot: { item: "i:row", resource: "r:one", place: "p:slot", state: "v:off" }, controls });
  expect(carried?.spot).toEqual({ item: "i:row", resource: "r:one", place: "p:slot", state: "v:off" });
  expect(carried?.controls).toEqual(controls);
  expect(run({ spot: { place: "a slot, in words", state: 7 } })?.spot).toBeUndefined();
  const tooMany = Object.fromEntries(Array.from({ length: 2_001 }, (_, index) => [`v:${index}`, 1]));
  for (const malformed of [
    { ...controls, page: "a page, in words" },
    { ...controls, before: { "v:off": 0 } },
    { ...controls, after: { "v:on": 1.5 } },
    { ...controls, after: { "not a token!": 1 } },
    { ...controls, before: tooMany },
    { page: "p:page", before: { "v:off": 1 } },
    { ...controls, before: ["v:off"] }
  ]) {
    const act = run({ controls: malformed as JsonObject });
    expect(act?.step).toBe(1);
    expect(act?.controls).toBeUndefined();
  }
});

// L1 d7: the step page's location rides with its controls, as a read carries `location` beside `scope`, so a ledger that has
// read no page of it knows where to look; a malformed location is dropped and the counts kept.
it("carries the step page's location with its controls, and drops a malformed one while keeping the counts", () => {
  const controls = { page: "p:page", before: { "v:off": 1 }, after: { "v:on": 1 } };
  const run = (location: JsonValue) => automationStudioCandidateTrialLandedActs(trace([attempt("add", "succeeded", { stateRefs: { stateDiff: { added: ["pressed"], removed: [], documentChanged: false, spot: { place: "p:slot", state: "v:off" }, controls: { ...controls, location } } } })]), graph)[0];
  expect(run("https://site.test/items/7?view=full")?.controls).toEqual({ ...controls, location: "https://site.test/items/7?view=full" });
  for (const malformed of ["", "loc:page\nmore", "loc:\u0000page", "x".repeat(2_049), 7, null, ["loc:page"], { href: "loc:page" }] as JsonValue[]) {
    const act = run(malformed);
    expect(act?.step).toBe(1);
    expect(act?.controls).toEqual(controls);
  }
});

// t738, rerun round 2 `run-mvgf801u-cc23575e`: a press on a page the trial reached by a row-bound address read its
// location off the saved trace as the withholding marker, so no settle clause could name that page.
it("takes a trial act's page address from the run as executed, where the saved trace withheld it, and nothing else", async () => {
  const address = "https://reading-list.test/books/42";
  const flow = {
    schemaVersion: "0.1", flowId: "flow.want-to-read", ownerKind: "task", ownerId: "task.want-to-read", name: "Want to read", createdAt: 1, updatedAt: 1,
    nodes: [
      { id: "row", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.dom.extract", parameters: { selector: "#book" } } },
      { id: "open", definitionId: "builtin.policy.action", parameterValues: { outputId: "web.output.browser-navigate", parameters: { url: { $state: { path: "row.link" } } } } },
      { id: "want", definitionId: "builtin.policy.action", label: "Want to read", parameterValues: { outputId: "web.output.dom-click", parameters: { selector: "#want" } }, metadata: { declaredConsequences: ["create_new"] } }
    ],
    edges: [
      { id: "row.open", sourceNodeId: "row", sourcePortId: "success", targetNodeId: "open", targetPortId: "in" },
      { id: "open.want", sourceNodeId: "open", sourcePortId: "success", targetNodeId: "want", targetPortId: "in" }
    ]
  } as unknown as AutomationStudioFlowArtifact;
  let tab = "https://reading-list.test/", captured = 0;
  const run = await runAutomationStudioGraph(flow as unknown as Parameters<typeof runAutomationStudioGraph>[0], {
    effectDispatcher: (effect) => {
      const payload = (effect.payload ?? {}) as Record<string, JsonValue>, parameters = (payload.parameters ?? {}) as Record<string, JsonValue>;
      if (payload.outputId === "web.dom.extract") return { status: "success", route: "success", outputs: { link: address } };
      if (payload.outputId === "web.output.browser-navigate") tab = String(parameters.url);
      return { status: "success", route: "success", outputs: {} };
    },
    hostRuntime: {
      capabilities: [],
      captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `s.${++captured}`, stateRef: `s.${captured}@${attemptId}:${point}`, capturedAt: captured, summary: {} }),
      inspectStateDiff: ({ node }) => (node.id === "want"
        ? { added: ["pressed"], removed: [], documentChanged: false, spot: { place: "p:slot", state: "v:off" }, controls: { page: "p:book", location: tab, before: { "v:off": 1 }, after: { "v:on": 1 } } }
        : { added: [], removed: [], documentChanged: node.id === "open" })
    }
  });
  expect(run.status).toBe("succeeded");
  // The saved trace still withholds the address everywhere, the press's own diff included.
  expect(JSON.stringify(run)).not.toContain(address);
  expect(run.attempts.find((attempt) => attempt.nodeId === "want")?.stateRefs?.stateDiff?.controls).toMatchObject({ location: AUTOMATION_STUDIO_WITHHELD_VALUE });
  const acts = automationStudioCandidateTrialLandedActs(run, flow);
  // A copy of the saved trace is read as it is: what every field of the act reads from the withheld trace alone.
  const withheld = automationStudioCandidateTrialLandedActs(structuredClone(run), flow);
  expect(withheld).toHaveLength(1);
  expect(withheld[0]?.controls?.location).toBe(AUTOMATION_STUDIO_WITHHELD_VALUE);
  expect(acts).toEqual([{ ...withheld[0], controls: { ...withheld[0]!.controls!, location: address } }]);
});
