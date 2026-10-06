import { describe, expect, it } from "vitest";
import { applyAutomationStudioFlowDraftAmendments, AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA } from "../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../step.ts";
import { automationStudioFlowDraftStepIsProposed } from "../../step.ts";

function steps(): AutomationStudioFlowDraftStep[] {
  return [1, 2, 3].map((position) => ({
    position, iteration: position, actionId: "press", input: { target: `target.${position}` },
    effect: "mutate" as const, effectApplied: true, disposition: "kept" as const
  }));
}

describe("amending the draft", () => {
  it("can route and bind a checked candidate without inventing executed instance proof", () => {
    const draft = steps();
    const original = structuredClone(draft[1]!);
    draft[1]!.priorExecution = { ...original, lasting: true };
    draft[1]!.checkedCandidate = { callId: "check", code: "core.replay.verified" };
    draft[1]!.effectApplied = false;
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "optional" }])).toEqual({ applied: 1, refused: [] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { target: { $input: "target", test: "other" } } }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]!.instance).toBeUndefined();
    expect(draft[1]!.priorExecution?.input).toEqual(original.input);
    expect(draft[1]!.effectApplied).toBe(false);
    expect(draft[1]).not.toHaveProperty("written");
  });
  it("explicitly removes a mistaken repeat without changing the quantity step or its claims", () => {
    const draft = steps();
    draft[1]!.routing = { kind: "repeat", through: "p3", over: "p1" };
    draft[1]!.acts = ["a2.quantity"];
    draft[1]!.settings = { attempts: 2 };
    for (const step of draft) step.replayed = { step: step.position, actionId: step.actionId, status: "replayed" };
    const prior = structuredClone(draft);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]!.routing).toBeUndefined();
    expect(draft[1]).toMatchObject({ input: prior[1]!.input, acts: ["a2.quantity"], disposition: "kept", settings: { attempts: 2 } });
    expect(draft.map((step) => step.replayed?.status)).toEqual(["replayed", undefined, undefined]);
    expect(draft[0]).toEqual(prior[0]);
  });

  it("unrepeat leaves other routing and the draft untouched, and repeated removal is no progress", () => {
    for (const routing of [undefined, { kind: "optional" as const }, { kind: "only_if" as const, check: "p1" }, { kind: "on_failed" as const, to: "p3" }]) {
      const draft = steps();
      if (routing) draft[1]!.routing = routing;
      const before = structuredClone(draft);
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "unrepeat" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
      expect(draft).toEqual(before);
    }
    const draft = steps();
    draft[1]!.routing = { kind: "repeat", through: "p2", over: "p1" };
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "unrepeat" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "unrepeat" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
  });

  it("drops, marks exploratory and puts back, and carries settings alongside", () => {
    const draft = steps();
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 1, change: "drop" },
      { step: 2, change: "exploratory" },
      { step: 3, change: "keep", settings: { waitFor: "results" } }
    ]);
    expect(report).toEqual({ applied: 3, refused: [] });
    expect(draft.map((step) => step.disposition)).toEqual(["dropped", "exploratory", "kept"]);
    expect(draft.map(automationStudioFlowDraftStepIsProposed)).toEqual([false, false, true]);
    expect(draft[2]?.settings).toEqual({ waitFor: "results" });
  });

  it("merges settings over what a step already carried", () => {
    const draft = steps();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", settings: { waitFor: "results", attempts: 2 } }]);
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", settings: { attempts: 5 } }]);
    expect(draft[0]?.settings).toEqual({ waitFor: "results", attempts: 5 });
  });

  // The no-progress guard is the only thing that stops a model editing one
  // step forever, and it can only do that if an edit that changed nothing is
  // reported rather than counted as work.
  it("refuses an edit that names no step, or that says what is already true", () => {
    const draft = steps();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 9, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 9, reason: "no_such_step" }] });
    // Said as the side of the Flow the step is already on, which is what the
    // edit was trying to settle: a keep about a step in the Flow is a
    // confirmation, and the generic "already so" got it sent again.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_in_flow" }] });
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "drop" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "already_out" }] });
  });

  // A step that did not work is out of the Flow whatever it is called, so the
  // only edit that can change it is running it again. Every hard live build of
  // 2026-09-28 spent decisions dropping or keeping refused presses.
  it("refuses every edit but rerun about a step that did not work, and changes nothing about it", () => {
    const draft = steps();
    draft[1] = { ...draft[1]!, effectApplied: false, resultCode: "action.refused" };
    const changes = ["drop", "exploratory", "keep", "optional"] as const;
    for (const change of changes) {
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "did_not_work" }] });
    }
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "reorder", to: 1 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "did_not_work" }] });
    expect(draft.map((step) => [step.position, step.disposition, step.routing])).toEqual([[1, "kept", undefined], [2, "kept", undefined], [3, "kept", undefined]]);
    // A rerun is still the loop's to carry out, and the one edit not refused for this.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "rerun", input: {} }]).refused).toEqual([{ step: 2, reason: "run_by_the_loop" }]);
  });
});

// Live run 36 (`run-muq3uozx-3153564b`): a listing named as the act, a repeat
// erased by `keep act`, and "already in the Flow" for an act already named.
describe("acts on the draft", () => {
  // d1 lists the requests (a read a Flow holds), d2 confirms each (repeat over d1).
  function listingAndConfirm(): AutomationStudioFlowDraftStep[] {
    return [
      { position: 1, id: "d1", iteration: 1, actionId: "list", input: {}, effect: "observe", proposes: true, effectApplied: true, disposition: "taken" },
      { position: 2, id: "d2", iteration: 2, actionId: "press", input: { target: "confirm" }, effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"], routing: { kind: "repeat", through: "d2", over: "d1" } }
    ];
  }

  // Information, not a refusal (user, 2026-10-01): the step goes into the Flow
  // as asked, the act is not recorded on a read, and the model is told why.
  it("applies an add or keep that names an act on a read, records no act there, and says why", () => {
    const draft = listingAndConfirm();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "add", act: "a1" }])).toEqual({ applied: 1, refused: [{ step: 1, reason: "act_on_a_read" }] });
    expect(draft[0]).toMatchObject({ disposition: "kept" });
    expect(draft[0]?.acts).toBeUndefined();
    // Said again about the listing now in the Flow: only the act was news, and it is told once.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "keep", act: "a1" }])).toEqual({ applied: 0, refused: [{ step: 1, reason: "act_on_a_read" }] });
    expect(draft[0]?.acts).toBeUndefined();
    // The press still names the act.
    expect(draft[1]?.acts).toEqual(["a1"]);
  });

  it("refuses an act the step already names as act_already_named, not as already in the Flow, naming the act", () => {
    const draft = listingAndConfirm();
    // The act rides on the refusal, so the telling can read the checklist for it
    // (run-muqiojz4-04a7a8fc named a done act five times running).
    for (const change of ["add", "keep"] as const) {
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change, act: "a1" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "act_already_named", act: "a1" }] });
    }
    expect(draft[1]?.acts).toEqual(["a1"]);
  });

  it("never lets keep erase a repeat, and keep with act clears no routing at all", () => {
    const draft = listingAndConfirm();
    // A keep carrying an act is about the act: the repeat stays.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep", act: "a2" }])).toEqual({ applied: 1, refused: [] });
    expect(draft[1]).toMatchObject({ acts: ["a1", "a2"], routing: { kind: "repeat", through: "d2", over: "d1" } });
    // A bare keep does not clear a repeat either: there is nothing to undo.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep" }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_in_flow" }] });
    expect(draft[1]?.routing).toEqual({ kind: "repeat", through: "d2", over: "d1" });
    // A condition is still cleared by a bare keep, and not by keep with act.
    draft[1]!.routing = { kind: "optional" };
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep", act: "a3" }]).applied).toBe(1);
    expect(draft[1]?.routing).toEqual({ kind: "optional" });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "keep" }]).applied).toBe(1);
    expect(draft[1]?.routing).toBeUndefined();
  });
});

// Live run 37 (`run-muq5v4zg-39182b58`): the filtered request listing was step
// 13, in the Flow, with no press after it. The model sent `13 repeat over 13`,
// then reran step 13 unchanged three times, as the schema's "first rerun the
// listing" told it to.
describe("a repeat on a listing, run 37", () => {
  function filteredListing(): AutomationStudioFlowDraftStep[] {
    return [
      { position: 1, id: "d1", iteration: 1, actionId: "go", input: {}, effect: "mutate", effectApplied: true, disposition: "kept" },
      { position: 2, id: "d2", iteration: 2, actionId: "list", input: { where: "atLeast 5" }, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" }
    ];
  }

  it("is refused over_not_before carrying the step it named as over, and writes no routing", () => {
    const draft = filteredListing();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 2, through: 2 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "over_not_before", over: 2 }] });
    expect(draft[1]?.routing).toBeUndefined();
  });

  it("the schema puts the repeat on the act, never the listing, and never reruns a listing as it stands", () => {
    const change = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>).change!.description;
    expect(change).not.toContain("first rerun the listing");
    expect(change).toContain("never to run it again as it stands");
    expect(change).toContain("The repeat goes on the act, never on the listing itself");
    expect(change).toContain("that row's own control");
  });
});

// `bind` generalizes a step that worked: a concrete argument is lifted into a
// binding the Flow resolves at run time, and the run that worked stays as the
// step's `instance` (design D2, t252).
describe("binding a step's arguments", () => {
  // Design B7 assertion 3: a whole object the step already has binds as one
  // value, with its object test or the object it replaces as the default.
  it("binds a whole object the step already has, with its object test or the object it replaces", () => {
    for (const explicit of [false, true]) {
      const object = { label: "fixture", options: { count: 2 } };
      const argument = { parameters: { configuration: object } };
      const draft: AutomationStudioFlowDraftStep[] = [{ position: 1, iteration: 1, actionId: "fixture.configure",
        input: structuredClone(argument), ranWith: structuredClone(argument), effect: "mutate", effectApplied: true, disposition: "kept" }];
      const form = { $input: "configuration", ...(explicit ? { test: object } : {}) };
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "bind", input: { configuration: form } }])).toMatchObject({ applied: 1, refused: [] });
      expect(draft[0]?.ranWith).toEqual({ parameters: { configuration: { $state: { path: "configuration", fallback: object } } } });
      expect(draft[0]?.instance).toEqual(argument);
    }
  });
  // d1 lists the rows, d2 searches with a typed value, d3 acts on one row and repeats over d1.
  function loopDraft(): AutomationStudioFlowDraftStep[] {
    const search = { node: "node.search", parameters: { query: "blue towels", options: { limit: 5 } }, consequences: [] };
    const act = { node: "node.act", parameters: { target: { handle: "t9" }, note: "ok" }, consequences: ["lasting"] };
    return [
      { position: 1, id: "d1", iteration: 1, actionId: "node.list", input: { node: "node.list", parameters: {} }, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" },
      { position: 2, id: "d2", iteration: 2, actionId: "node.search", input: structuredClone(search), ranWith: structuredClone(search), effect: "mutate", effectApplied: true, disposition: "kept" },
      { position: 3, id: "d3", iteration: 3, actionId: "node.act", input: structuredClone(act), ranWith: { ...structuredClone(act), parameters: { target: { identity: "frozen" }, note: "ok" } }, effect: "mutate", effectApplied: true, disposition: "kept", routing: { kind: "repeat", through: "d3", over: "d1" } }
    ];
  }

  it("is a change the schema offers", () => {
    const change = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { enum: string[]; description: string }>).change!;
    expect(change.enum).toContain("bind");
    expect(change.description).toContain("bind:");
    const input = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>).input!.description;
    expect(input).toContain("bind");
    expect(input).toContain("$input");
    expect(input).toContain("$row");
  });

  it("lifts a value into a Flow input, keeps the run that worked as instance, and takes the replaced value as the test value", () => {
    const draft = loopDraft();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { query: { $input: "query" } } }])).toEqual({ applied: 1, refused: [] });
    const bound = { $state: { path: "query", fallback: "blue towels" } };
    expect(draft[1]?.ranWith).toEqual({ node: "node.search", parameters: { query: bound, options: { limit: 5 } }, consequences: [] });
    expect(draft[1]?.input).toEqual({ node: "node.search", parameters: { query: bound, options: { limit: 5 } }, consequences: [] });
    expect(draft[1]?.instance).toEqual({ node: "node.search", parameters: { query: "blue towels", options: { limit: 5 } }, consequences: [] });
    // Bound again with another test value: the first concrete run stays the instance.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { parameters: { query: { $input: "query", test: "red towels" } } } }]).applied).toBe(1);
    expect(draft[1]?.ranWith?.parameters).toMatchObject({ query: { $state: { path: "query", fallback: "red towels" } } });
    expect(draft[1]?.instance?.parameters).toMatchObject({ query: "blue towels" });
    // The same binding again changes nothing.
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { query: { $input: "query", test: "red towels" } } }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "already_so" }] });
  });

  it("binds a nested value, and a row field on a step inside a repeat span", () => {
    const draft = loopDraft();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { options: { limit: { $input: "limit" } } } }]).applied).toBe(1);
    expect(draft[1]?.ranWith?.parameters).toMatchObject({ options: { limit: { $state: { path: "limit", fallback: 5 } } } });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "bind", input: { note: { $row: "name" } } }])).toEqual({ applied: 1, refused: [] });
    expect(draft[2]?.ranWith?.parameters).toEqual({ target: { identity: "frozen" }, note: { $state: { path: "item.name" } } });
    expect(draft[2]?.input.parameters).toEqual({ target: { handle: "t9" }, note: { $state: { path: "item.name" } } });
  });

  it("refuses a row field on a step outside every repeat span", () => {
    const draft = loopDraft();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { query: { $row: "name" } } }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "bind_row_outside_loop", parameter: "query" }] });
    expect(draft[1]?.ranWith?.parameters).toMatchObject({ query: "blue towels" });
    expect(draft[1]?.instance).toBeUndefined();
  });

  it("refuses a leaf that is not a binding, a key the step does not have, and a malformed form, changing nothing", () => {
    const draft = loopDraft();
    const before = structuredClone(draft);
    const refusedFor = (input: Record<string, unknown>) => applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: input as never }]).refused;
    expect(refusedFor({ query: "red towels" })).toEqual([{ step: 2, reason: "bind_not_a_binding", parameter: "query" }]);
    expect(refusedFor({ query: { $input: "query" }, options: { limit: 7 } })).toEqual([{ step: 2, reason: "bind_not_a_binding", parameter: "options.limit" }]);
    expect(refusedFor({})).toEqual([{ step: 2, reason: "bind_not_a_binding" }]);
    expect(refusedFor({ page: { $input: "page", test: 2 } })).toEqual([{ step: 2, reason: "bind_new_key", parameter: "page", bindable: ["query", "options", "options.limit"] }]);
    expect(refusedFor({ options: { sort: { $input: "sort", test: "asc" } } })).toEqual([{ step: 2, reason: "bind_new_key", parameter: "options.sort", bindable: ["query", "options", "options.limit"] }]);
    expect(refusedFor({ query: { $input: "Query" } })).toEqual([{ step: 2, reason: "bind_malformed", parameter: "query" }]);
    expect(refusedFor({ query: { $step: 1, output: "records" } })).toEqual([{ step: 2, reason: "bind_malformed", parameter: "query" }]);
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind" }]).refused).toEqual([{ step: 2, reason: "bind_not_a_binding" }]);
    expect(draft).toEqual(before);
  });

  // Live run `run-musp4h2f-72e8ed99` (cause 5): the draft showed step 9, the
  // "12 Double Rolls" press, as `parameters: {target: {handle: t667}}`, and the
  // model bound that `target`. The press ran with its control resolved to a
  // selector, so `target` is no value it ran with. The refusal keeps its code
  // and says it named the control (`control`), which the answer tells as a
  // press rather than as a key the model invented
  // (`../../../llm/draft-amendment-feedback.ts`).
  it("marks a bind of the control a press acted on, which the draft shows but the step ran with no value at", () => {
    const draft: AutomationStudioFlowDraftStep[] = [{
      position: 1, id: "d9", iteration: 9, actionId: "web.output.dom-click",
      input: { node: "web.output.dom-click", parameters: { target: { handle: "t667" } }, consequences: [] },
      ranWith: { node: "web.output.dom-click", parameters: { selector: "#variant-12", element: { tag: "button" } }, consequences: [] },
      effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a2.size"]
    }];
    const before = structuredClone(draft);
    const refusedFor = (input: Record<string, unknown>) => applyAutomationStudioFlowDraftAmendments(draft, [{ step: 1, change: "bind", input: input as never }]).refused;
    // 0021: a binding form on the target itself.
    expect(refusedFor({ target: { $input: "paperTowelVariant", test: { handle: "t667" } } })).toEqual([{ step: 1, reason: "bind_new_key", parameter: "target", control: true, bindable: [] }]);
    // A form below it, under the parameters wrapper.
    expect(refusedFor({ parameters: { target: { handle: { $input: "variant", test: "t667" } } } })).toEqual([{ step: 1, reason: "bind_new_key", parameter: "target", control: true, bindable: [] }]);
    // A key neither shown nor run with is a new key, as before.
    expect(refusedFor({ quantity: { $input: "quantity", test: 2 } })).toEqual([{ step: 1, reason: "bind_new_key", parameter: "quantity", bindable: [] }]);
    expect(draft).toEqual(before);
  });

  it("binds only a step in the Flow", () => {
    const draft = loopDraft();
    draft[1]!.disposition = "taken";
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "bind", input: { query: { $input: "query" } } }]).refused).toEqual([{ step: 2, reason: "not_a_kept_step" }]);
  });

  it("binds a written step without making an instance of it, and never calls a written step did_not_work", () => {
    const draft = loopDraft();
    Object.assign(draft[2]!, { written: true, effectApplied: false, resultCode: "core.run_node.written" });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "bind", input: { note: { $row: "name" } } }])).toEqual({ applied: 1, refused: [] });
    expect(draft[2]?.instance).toBeUndefined();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "optional" }])).toEqual({ applied: 1, refused: [] });
  });
});

// Live run `run-murz83zy-5030820f` (R8): the model pressed Amara's Confirm as
// step 9 and ran the filtered request listing only at step 18, then sent
// `9 repeat over 18` six times, each refused `over_not_before` with words that
// asked for exactly that amendment. The listing has to be moved before the act
// first; these pin that a refusal says where the act was, and that one
// decision sending the reorder and the repeat applies, every number in it
// naming the step as the draft shown numbered it (run musr9pv3, below).
describe("a repeat on an act that sits before its listing, run murz83zy", () => {
  function pressedBeforeListing(): AutomationStudioFlowDraftStep[] {
    return [
      { position: 1, id: "d1", iteration: 1, actionId: "go", input: {}, effect: "mutate", effectApplied: true, disposition: "kept" },
      { position: 2, id: "d2", iteration: 2, actionId: "press", input: { target: "confirm" }, effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"] },
      { position: 3, id: "d3", iteration: 3, actionId: "press", input: { target: "dialog.ok" }, effect: "mutate", effectApplied: true, disposition: "kept" },
      { position: 4, id: "d4", iteration: 4, actionId: "look", input: {}, effect: "observe", effectApplied: false, disposition: "taken" },
      { position: 5, id: "d5", iteration: 5, actionId: "list", input: { where: "atLeast 5" }, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" }
    ];
  }

  it("is refused over_not_before carrying over, and through when one was given, and writes no routing", () => {
    const draft = pressedBeforeListing();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 5 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "over_not_before", over: 5 }] });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 2, change: "repeat", over: 5, through: 3 }])).toEqual({ applied: 0, refused: [{ step: 2, reason: "over_not_before", over: 5, through: 3 }] });
    expect(draft[1]?.routing).toBeUndefined();
  });

  it("applies the reorder and the repeat in one decision, both numbered as the draft was shown", () => {
    const draft = pressedBeforeListing();
    // What the refusal tells it to send (`../../../llm/draft-amendment-feedback.ts`):
    // the listing moves to the act's place, and the repeat names the act, its
    // confirmation and the listing by the numbers shown; the draft is
    // renumbered once, after the decision.
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 5, change: "reorder", to: 2 },
      { step: 2, change: "repeat", over: 5, through: 3 }
    ]);
    expect(report).toEqual({ applied: 2, refused: [] });
    expect(draft.map((step) => [step.position, step.id])).toEqual([[1, "d1"], [2, "d5"], [3, "d2"], [4, "d3"], [5, "d4"]]);
    expect(draft.find((step) => step.id === "d2")?.routing).toEqual({ kind: "repeat", through: "d3", over: "d5" });
  });

  it("the schema says a listing after the act is moved before it first", () => {
    const change = (AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>).change!.description;
    expect(change).toContain("When the listing comes after the act, reorder the listing to the act's position first");
  });
});

// Live run `run-musq0b1m-0472cfa0`, Cause 6 (steps 0052-0058): test 1 marked
// the Space Grey step `replayed: unreproducible`; the model reordered it after
// the listing click, which fixed it, and the draft still showed it
// unreproducible -- the model reordered four times. A step's mark is how it
// answered with the steps before it as they stood then, so a move that changes
// what comes before a step leaves it untested in the new order.
describe("a move leaves the steps it reorders untested", () => {
  const marked = (): AutomationStudioFlowDraftStep[] => [1, 2, 3, 4].map((position) => ({
    position, iteration: position, actionId: "press", input: { target: `target.${position}` }, effect: "mutate" as const, effectApplied: true, disposition: "kept" as const,
    replayed: { step: position, actionId: "press", status: position === 3 ? "unreproducible" as const : "replayed" as const }
  }));

  it("clears the moved step's mark, and every mark from where the move begins", () => {
    const draft = marked();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "reorder", to: 2 }])).toEqual({ applied: 1, refused: [] });
    expect(draft.map((step) => step.input.target)).toEqual(["target.1", "target.3", "target.2", "target.4"]);
    expect(draft.map((step) => step.replayed?.status)).toEqual(["replayed", undefined, undefined, undefined]);
  });

  it("does the same for a step moved later, and for an add that places it", () => {
    const later = marked();
    applyAutomationStudioFlowDraftAmendments(later, [{ step: 2, change: "reorder", to: 3 }]);
    expect(later.map((step) => step.replayed?.status)).toEqual(["replayed", undefined, undefined, undefined]);
    const placed = marked();
    placed[2]!.disposition = "taken";
    applyAutomationStudioFlowDraftAmendments(placed, [{ step: 3, change: "add", to: 4 }]);
    expect(placed.map((step) => step.replayed?.status)).toEqual(["replayed", "replayed", undefined, undefined]);
  });

  it("keeps every mark when nothing moved", () => {
    const draft = marked();
    applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "reorder", to: 3, settings: { waitFor: "results" } }]);
    expect(draft.map((step) => step.replayed?.status)).toEqual(["replayed", "replayed", "unreproducible", "replayed"]);
  });
});

// Run mustzxhi bound a press's target about 12 times, told that "a value the
// person gave that would change between runs" is bound. Core binds a value a
// step typed, or a read's condition; a press's control or option never.
describe("what bind is said to be for", () => {
  it("names a typed value or a read's condition, and says a press's control or option is never bound", () => {
    const properties = AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>;
    for (const description of [properties.change!.description, properties.input!.description]) {
      expect(description).toContain("a value a step typed, or a read's condition");
      expect(description).toContain("a press's control or option is never bound");
    }
    expect(properties.change!.description).not.toContain("would change between runs");
  });
});

// Live run `run-musp474o-e0ed7432` reran the withdrawn attempt of a listing --
// the receipt its own rerun left -- three times, and was told only that the
// argument had already run. An amendment naming such an attempt changes
// nothing and is told which step replaced it, so it changes that one instead.
describe("an amendment naming the attempt a rerun replaced", () => {
  const receiptDraft = (): AutomationStudioFlowDraftStep[] => [
    { position: 1, id: "d18", iteration: 3, actionId: "list", input: { where: "fixed" }, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" },
    { position: 2, id: "d7", iteration: 2, actionId: "press", input: { target: "t1" }, effect: "mutate", effectApplied: true, disposition: "kept" },
    { position: 3, id: "d6", iteration: 1, actionId: "list", input: { where: "old" }, effect: "observe", proposes: true, effectApplied: true, disposition: "dropped", replacedBy: "d18" }
  ];

  it("is refused naming the step that replaced it, and leaves the attempt out of the Flow", () => {
    const draft = receiptDraft();
    const report = applyAutomationStudioFlowDraftAmendments(draft, [
      { step: 3, change: "add" },
      { step: 3, change: "keep", act: "a1" },
      { step: 3, change: "reorder", to: 1 },
      { step: 3, change: "bind", input: { where: { $input: "where" } } },
      { step: 3, change: "unrepeat" }
    ]);
    expect(report.applied).toBe(0);
    expect(report.refused).toEqual([3, 3, 3, 3, 3].map((step) => ({ step, reason: "not_a_kept_step", replacedBy: 1 })));
    expect(draft.map((step) => [step.id, step.position, step.disposition])).toEqual([["d18", 1, "kept"], ["d7", 2, "kept"], ["d6", 3, "dropped"]]);
  });

  it("names the step standing now when the rerun was replaced in turn", () => {
    const draft = receiptDraft();
    draft[0]!.replacedBy = "d20";
    draft[0]!.disposition = "dropped";
    draft.push({ position: 4, id: "d20", iteration: 4, actionId: "list", input: { where: "newest" }, effect: "observe", proposes: true, effectApplied: true, disposition: "kept" });
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 3, change: "drop" }]).refused).toEqual([{ step: 3, reason: "not_a_kept_step", replacedBy: 4 }]);
  });
});

// Live run `run-musr9pv3-f4bf6256`. At decision 0072 the draft read: 13 the
// attempt step 15's rerun replaced, 14 a dropped listing, 15 the kept listing
// carrying a stray `repeats through step 15, over step 16`, and 16 the
// Confirm (act a1) repeating over 15. The stray came from decisions 0056-0064
// sending a reorder and a repeat in one amend_draft: Core renumbered between
// the two, so the repeat landed on the listing, and a later reorder moved the
// listing ahead of the press with nothing revalidating its repeat. `unrepeat`
// (t262) takes such a repeat off; the revalidation and the shown numbering
// are what keep it from being made.
describe("a stray repeat on a listing, run musr9pv3", () => {
  const filler = (position: number): AutomationStudioFlowDraftStep => ({
    position, id: `s${position}`, iteration: position, actionId: "web.output.dom-click", input: { target: `t${position}` },
    effect: "mutate", effectApplied: true, disposition: position < 4 ? "kept" : "dropped"
  });
  const listing = (position: number, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep => ({
    position, id: `s${position}`, iteration: position, actionId: "web.output.dom-extract_list", input: { where: "5 or more mutual friends" },
    effect: "observe", proposes: true, effectApplied: true, disposition
  });
  /** The draft the model was shown at 0072, steps 13-16 as the run had them. */
  function shownAt0072(): AutomationStudioFlowDraftStep[] {
    return [
      ...Array.from({ length: 12 }, (_, index) => filler(index + 1)),
      { ...listing(13, "dropped"), replacedBy: "s15" },
      listing(14, "dropped"),
      { ...listing(15, "kept"), routing: { kind: "repeat", through: "s15", over: "s16" } },
      { position: 16, id: "s16", iteration: 16, actionId: "web.output.dom-click", input: { target: "Confirm" }, effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"], routing: { kind: "repeat", through: "s16", over: "s15" } }
    ];
  }
  const byId = (draft: readonly AutomationStudioFlowDraftStep[], id: string) => draft.find((step) => step.id === id)!;

  it("unrepeat takes the stray repeat off the listing, leaves the Confirm's standing, and is refused on the replaced attempt", () => {
    const draft = shownAt0072();
    expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 15, change: "unrepeat" }])).toEqual({ applied: 1, refused: [] });
    expect(byId(draft, "s15").routing).toBeUndefined();
    expect(byId(draft, "s16").routing).toEqual({ kind: "repeat", through: "s16", over: "s15" });
    expect(applyAutomationStudioFlowDraftAmendments(shownAt0072(), [{ step: 13, change: "unrepeat" }])).toEqual({ applied: 0, refused: [{ step: 13, reason: "not_a_kept_step", replacedBy: 15 }] });
  });

  describe("a move revalidates every repeat after the decision", () => {
    it("takes off a repeat whose over runs after it once the decision has moved a step, and says which and why", () => {
      const draft = shownAt0072();
      const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 14, change: "reorder", to: 13 }]);
      expect(report).toEqual({ applied: 1, refused: [{ step: 15, reason: "repeat_taken_off", over: 16, takenOff: "over_after" }] });
      expect(byId(draft, "s15").routing).toBeUndefined();
      expect(byId(draft, "s16").routing).toEqual({ kind: "repeat", through: "s16", over: "s15" });
    });

    it("takes off the Confirm's repeat when the listing it repeats over is moved after it, and gives the new numbers", () => {
      const draft = shownAt0072();
      const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 15, change: "unrepeat" }, { step: 15, change: "reorder", to: 16 }]);
      expect(report).toEqual({ applied: 2, refused: [{ step: 16, reason: "repeat_taken_off", over: 15, takenOff: "over_after", now: 15, overNow: 16 }] });
      expect(draft.map((step) => step.id).slice(14)).toEqual(["s16", "s15"]);
      expect(draft.every((step) => step.routing === undefined)).toBe(true);
    });

    it("takes off a repeat whose span no longer holds together, and an add with to revalidates too", () => {
      const draft = shownAt0072();
      // The Confirm repeats through the step after it; that step is then added ahead of the Confirm.
      draft.push({ position: 17, id: "s17", iteration: 17, actionId: "web.output.dom-click", input: { target: "OK" }, effect: "mutate", effectApplied: true, disposition: "taken" });
      delete byId(draft, "s15").routing;
      byId(draft, "s16").routing = { kind: "repeat", through: "s17", over: "s15" };
      const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 17, change: "add", to: 16 }]);
      expect(report).toEqual({ applied: 1, refused: [{ step: 16, reason: "repeat_taken_off", over: 15, through: 17, takenOff: "span_broken", now: 17, throughNow: 16 }] });
      expect(byId(draft, "s16").routing).toBeUndefined();
    });

    it("leaves every repeat standing that still holds", () => {
      const draft = shownAt0072();
      delete byId(draft, "s15").routing;
      expect(applyAutomationStudioFlowDraftAmendments(draft, [{ step: 14, change: "reorder", to: 13 }])).toEqual({ applied: 1, refused: [] });
      expect(byId(draft, "s16").routing).toEqual({ kind: "repeat", through: "s16", over: "s15" });
    });

    it("leaves the test marks before the move, and clears those of the step whose repeat it took off", () => {
      const draft = shownAt0072();
      for (const step of draft) step.replayed = { step: step.position, actionId: step.actionId, status: "replayed" };
      applyAutomationStudioFlowDraftAmendments(draft, [{ step: 12, change: "reorder", to: 11 }]);
      // The move cleared every mark from step 11 on, and the stray repeat on s15 was taken off with it.
      expect(draft.slice(0, 10).every((step) => step.replayed !== undefined)).toBe(true);
      expect(draft.slice(10).every((step) => step.replayed === undefined)).toBe(true);
      expect(byId(draft, "s15").routing).toBeUndefined();
    });
  });

  describe("every number in one decision names the step as the draft shown numbered it", () => {
    it("reads the second amendment against the draft shown, not the one the first left", () => {
      const draft = shownAt0072();
      // Step 14 moves to the end, then step 15 -- the listing, as shown -- has its stray repeat taken off.
      const report = applyAutomationStudioFlowDraftAmendments(draft, [{ step: 14, change: "reorder", to: 16 }, { step: 15, change: "unrepeat" }]);
      expect(report).toEqual({ applied: 2, refused: [] });
      expect(draft.map((step) => [step.id, step.position]).slice(12)).toEqual([["s13", 13], ["s15", 14], ["s16", 15], ["s14", 16]]);
      expect(byId(draft, "s15").routing).toBeUndefined();
      expect(byId(draft, "s16").routing).toEqual({ kind: "repeat", through: "s16", over: "s15" });
    });

    it("puts the listing before the press and the repeat on the press when both go in one decision, in either order", () => {
      for (const order of ["reorder first", "repeat first"] as const) {
        const draft = shownAt0072();
        // The press shown at 15 and the listing at 16, as decision 0060 read them.
        const press: AutomationStudioFlowDraftStep = { ...byId(draft, "s16"), position: 15 };
        const rows: AutomationStudioFlowDraftStep = { ...byId(draft, "s15"), position: 16 };
        delete press.routing;
        delete rows.routing;
        draft.splice(14, 2, press, rows);
        const reorder = { step: 16, change: "reorder" as const, to: 15 };
        const repeat = { step: 15, change: "repeat" as const, over: 16 };
        const report = applyAutomationStudioFlowDraftAmendments(draft, order === "reorder first" ? [reorder, repeat] : [repeat, reorder]);
        expect(report, order).toEqual({ applied: 2, refused: [] });
        expect(draft.slice(14).map((step) => [step.id, step.position, step.routing]), order).toEqual([
          ["s15", 15, undefined],
          ["s16", 16, { kind: "repeat", through: "s16", over: "s15" }]
        ]);
      }
    });

    it("no longer leaves a repeat on the listing from the decision that made the stray, 0056", () => {
      // 0056: 13 the replaced attempt, 14 the listing, 15 the Confirm repeating over 14, 16 a second listing.
      const draft = shownAt0072();
      const confirm: AutomationStudioFlowDraftStep = { ...byId(draft, "s16"), position: 15, id: "c", routing: { kind: "repeat", through: "c", over: "s14" } };
      draft.splice(13, 3, listing(14, "kept"), confirm, { ...listing(16, "kept"), id: "l2" });
      draft[12]!.replacedBy = "s14";
      const report = applyAutomationStudioFlowDraftAmendments(draft, [
        { step: 15, change: "reorder", to: 14 },
        { step: 15, change: "repeat", over: 14 },
        { step: 16, change: "reorder", to: 15 }
      ]);
      expect(draft.find((step) => step.id === "s14")?.routing).toBeUndefined();
      expect(draft.find((step) => step.id === "l2")?.routing).toBeUndefined();
      // Whatever repeat stands afterwards runs over a step before it.
      for (const step of draft) {
        if (step.routing?.kind !== "repeat") continue;
        const over = step.routing.over;
        expect(draft.findIndex((candidate) => candidate.id === over)).toBeLessThan(draft.indexOf(step));
      }
      // The Confirm's repeat could not stand once the listing it named ran after it, and the answer says so.
      expect(report.refused).toContainEqual(expect.objectContaining({ step: 15, reason: "repeat_taken_off", over: 14, takenOff: "over_after" }));
    });
  });

  it("the schema says how one decision's numbers are read and that a move can take a repeat off", () => {
    const properties = AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA.properties as Record<string, { description: string }>;
    expect(properties.change!.description).toContain("Every step number in one decision names the step as the draft shows it; the draft is renumbered once, after the whole decision.");
    expect(properties.change!.description).toContain("is taken off, and you are told which");
    expect(properties.to!.description).toContain("the place the step shown at that number holds");
  });
});
