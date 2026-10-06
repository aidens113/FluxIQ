import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftEntry, AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../entry.ts";
import type { AutomationStudioFlowDraftStep } from "../step.ts";

function step(position: number, actionId: string, input: Record<string, string>, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return { position, iteration: position, callId: `call.${position}`, actionId, input, effect: "mutate", effectApplied: true, disposition: "kept", ...over };
}

type Entry = {
  code: string;
  format?: string;
  steps: { step: number; actionId: string; input?: unknown; bindable?: string[]; control?: string; inputTooLarge?: boolean; inResult: boolean; disposition: string; changed: string; act?: string; replayed?: string; runs?: string; settings?: unknown }[];
  unlisted?: number;
  omitted?: string[];
  instruction: string;
};

const value = (steps: readonly AutomationStudioFlowDraftStep[]): Entry => automationStudioFlowDraftEntry({ steps })!.value as Entry;

describe("the draft entry a decision is shown", () => {
  it("shows checked intentions separately from private original performed proof", () => {
    const original = step(1, "press", { target: "original" }, { ranWith: { target: "private-resolved" }, stateBefore: "private-before", stateAfter: "private-after", acts: ["a1"] });
    const candidate = step(1, "press", { target: "replacement" }, { effectApplied: false, checkedCandidate: { callId: "checked", code: "core.replay.present" }, priorExecution: { ...original, lasting: true }, acts: ["a1"] });
    delete candidate.callId;
    const shown = value([candidate]);
    expect(shown.steps[0]).toMatchObject({ changed: "no", disposition: "kept", inResult: true, checkedCandidate: { callId: "checked", performed: false }, priorExecution: { callId: "call.1", configuration: "original", performed: true }, actEvidence: "intended" });
    expect(JSON.stringify(shown)).not.toContain("private-");
    expect(shown.steps[0]).not.toHaveProperty("written");
  });
  // The failure this exists for: the evidence window kept the newest result
  // of each tool, so five presses under one tool id left one visible and the
  // built Flow kept none of the dismissals the build had actually performed.
  it("lists every changing action, however many share one action id", () => {
    const steps = [
      step(1, "press", { target: "target.1" }),
      step(2, "press", { target: "target.4" }),
      step(3, "press", { target: "target.9" }),
      step(4, "enter", { target: "target.2", value: "earbuds" }),
      step(5, "press", { target: "target.7" })
    ];
    const entry = automationStudioFlowDraftEntry({ steps });
    expect(entry?.callId).toBe(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
    const shown = entry?.value as Entry;
    expect(shown.steps.map((listed) => listed.step)).toEqual([1, 2, 3, 4, 5]);
    expect(shown.steps.every((listed) => listed.inResult)).toBe(true);
    expect(shown.steps[2]?.input).toEqual({ target: "target.9" });
    expect(shown).not.toHaveProperty("format");
  });

  // The standing decision of 2026-09-30: the draft is always shown whole. No
  // byte budget, no packed rows, no shorter guidance, no argument withheld or
  // replaced by a marker, no oldest step counted instead of listed.
  it("is the full draft however long it is: every step, every argument, the full guidance", () => {
    const steps = Array.from({ length: 200 }, (_, index) => step(index + 1, index % 2 ? "enter" : "press", { target: `target.${index}`, value: "v".repeat(2_000) }));
    const shown = value(steps);
    expect(shown.steps).toHaveLength(200);
    expect(shown.steps.map((listed) => listed.step)).toEqual(steps.map((listed) => listed.position));
    expect(shown.steps.every((listed, index) => JSON.stringify(listed.input) === JSON.stringify(steps[index]!.input))).toBe(true);
    expect(shown.steps.some((listed) => listed.inputTooLarge)).toBe(false);
    expect(shown).not.toHaveProperty("format");
    expect(shown).not.toHaveProperty("unlisted");
    expect(shown).not.toHaveProperty("omitted");
    expect(shown.instruction).toBe(value([step(1, "press", { target: "t" })]).instruction);
    expect(Buffer.byteLength(JSON.stringify(shown), "utf8")).toBeGreaterThan(400_000);
  });

  it("carries an argument of any size whole, never a marker in its place", () => {
    const shown = value([step(1, "enter", { value: "y".repeat(50_000) })]);
    expect(shown.steps[0]?.input).toEqual({ value: "y".repeat(50_000) });
    expect(shown.steps[0]?.inputTooLarge).toBeUndefined();
  });

  it("tells the model how to correct the draft and how to repeat an act per listed item", () => {
    const { instruction } = value([step(1, "press", { target: "t" })]);
    expect(instruction).toContain("amend_draft");
    expect(instruction).toMatch(/every item of a list[^.]*repeat/u);
    // Every result is shown: nothing tells the model a result may have left.
    expect(instruction).not.toMatch(/still shown|no longer shown|evicted|omitted/u);
  });

  // Live run 37 (`run-muq5v4zg-39182b58`) read "then amend_draft repeat over
  // the listing step" as a repeat on the listing, `13 repeat over 13`, with no
  // press in the draft.
  it("says the three steps of a loop in order, and that the repeat goes on the press, never on the listing", () => {
    const authored = (automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry).instruction;
    expect(authored).toContain("three steps in this order");
    expect(authored).toContain(`{"step": <that press>, "change": "repeat", "over": <the listing>}`);
    expect(authored).toContain("The repeat goes on the press, never on the listing");
    expect(authored).toContain("a listing that already keeps the right rows is not run again");
    const transcript = value([step(1, "press", { target: "t" })]).instruction;
    expect(transcript).toContain("the repeat goes on the act, never on the listing");
    expect(transcript).toContain("A listing that already keeps the right rows is not run again.");
  });

  it("preserves every non-default value on a step line", () => {
    const special = step(1, "press", { target: "target.1" }, {
      resultCode: "action.refused",
      effectApplied: false,
      disposition: "exploratory",
      replayed: { step: 1, actionId: "press", status: "changed" },
      routing: { kind: "optional" },
      settings: { attempts: 2 }
    });
    expect(value([special]).steps[0]).toEqual({
      step: 1,
      actionId: "press",
      input: { target: "target.1" },
      resultCode: "action.refused",
      changed: "no",
      // A step that did not work is shown as that, whatever it was called.
      disposition: "did_not_work",
      inResult: false,
      replayed: "changed",
      runs: "optional: the Flow carries on when this fails",
      settings: { attempts: 2 }
    });
  });

  it("says which steps the result will not contain, rather than leaving them out", () => {
    const steps = [
      step(1, "press", { target: "target.1" }, { disposition: "exploratory" }),
      step(2, "press", { target: "target.4" }, { disposition: "dropped" }),
      step(3, "press", { target: "target.9" }, { effectApplied: false, resultCode: "web.action.rejected.target_unobserved" })
    ];
    expect(value(steps).steps.map((listed) => [listed.disposition, listed.inResult, listed.changed])).toEqual([
      ["exploratory", false, "yes"],
      ["dropped", false, "yes"],
      // Not `kept`: listed so under an instruction that said every step had
      // worked, a refused press read as one still to drop or confirm.
      ["did_not_work", false, "no"]
    ]);
  });

  // Live runs `run-murwd8le-79e735a8` and `run-musp8nz1-dbd3905a` shipped a
  // Space Grey pair that un-chose the colour the page arrived with and chose it
  // again; Core now takes such a pair out (`../reversal.ts`) and says why.
  it("says why Core took out a press, naming its partner's step, and nothing on a step it did not", () => {
    const lines = value([
      step(1, "press", { target: "grey" }, { id: "d1", disposition: "dropped", toggle: { key: "t941", to: "off" }, cancels: "d3" }),
      step(2, "press", { target: "spain" }, { id: "d2" }),
      step(3, "press", { target: "grey" }, { id: "d3", disposition: "dropped", toggle: { key: "t941", to: "on" }, cancels: "d1" }),
      step(4, "press", { target: "red" }, { id: "d4", disposition: "taken", toggle: { key: "t942", to: "off" } }),
      step(5, "press", { target: "red" }, { id: "d5", disposition: "dropped", toggle: { key: "t942", to: "on" }, cancels: "d4" })
    ]).steps as Array<Record<string, unknown>>;
    expect(lines.map((line) => line.inResult)).toEqual([false, true, false, false, false]);
    expect(String(lines[0]!.out)).toContain("step 3 pressed the same control back");
    expect(String(lines[2]!.out)).toContain("step 1");
    // The control was already in the state the Flow needs before the pair: chosen, here.
    expect(String(lines[0]!.out)).toMatch(/already chosen before step 1/u);
    expect(String(lines[0]!.out)).toContain("the step after which the page first showed it chosen");
    expect(String(lines[0]!.out)).toMatch(/pressing it again would undo/u);
    expect(lines[1]).not.toHaveProperty("out");
    expect(lines[3]).not.toHaveProperty("out");
    // Rule b: the step it put back is not in the Flow.
    expect(String(lines[4]!.out)).toContain("step 4");
    expect(String(lines[4]!.out)).toContain("is not in the Flow");
    // A half the model put back is in the Flow and says nothing more.
    const back = value([step(1, "press", { target: "grey" }, { id: "d1", toggle: { key: "t941", to: "off" }, cancels: "d2" })]).steps[0] as Record<string, unknown>;
    expect(back).not.toHaveProperty("out");
  });

  // Live run 36: step 11, a listing, named a1, and the model could not see it.
  it("shows the act each step names, and nothing on a step that names none", () => {
    const shown = value([
      step(1, "list", {}, { effect: "observe", proposes: true, acts: ["a1"] }),
      step(2, "press", { target: "confirm" }, { acts: ["a2", "a2.quantity"] }),
      step(3, "press", { target: "next" })
    ]);
    expect(shown.steps.map((listed) => listed.act)).toEqual(["a1", "a2, a2.quantity", undefined]);
    expect(shown.steps[2]).not.toHaveProperty("act");
  });

  // Live run `run-muqiho5c-e830ce01` pressed "Not now" and was shown the step
  // as `input: {target: {handle: "t1082"}}` alone, then added it as its "put
  // three in my cart" act and completed with an empty cart.
  it("names the control each step acted on, beside its input, and nothing on a step that acted on none", () => {
    const shown = value([
      step(1, "go", { url: "https://shop.test/" }),
      step(2, "press", { target: "t1082" }, { control: "Not now" })
    ]);
    expect(shown.steps[1]).toMatchObject({ step: 2, input: { target: "t1082" }, control: "Not now" });
    // Beside the input, where the model reads which step is which.
    expect(Object.keys(shown.steps[1]!).slice(0, 4)).toEqual(["step", "actionId", "input", "control"]);
    expect(shown.steps[0]).not.toHaveProperty("control");
  });

  it("tells an authoring model never to act itself on the items its listing left out", () => {
    const { instruction } = automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry;
    expect(instruction).toMatch(/every item of a list[^.]*repeat[^.]*never act yourself on the items your listing left out/u);
  });

  it("is nothing at all when the loop only looked", () => {
    expect(automationStudioFlowDraftEntry({ steps: [step(1, "inspect", {}, { effect: "observe" })] })).toBeUndefined();
    expect(automationStudioFlowDraftEntry({ steps: [] })).toBeUndefined();
  });

  // run-muqiojz4-04a7a8fc: ten presses that each read `{"target":{"handle":...}}`,
  // and the model named a "×" closing a chat overlay as its add-to-cart act.
  it("says which control each step named, in the domain's words, as does, beside the argument it ran with", () => {
    const steps = [
      step(1, "web.click", { handle: "t667" }, { words: { target: "12 Double Rolls" } }),
      step(2, "web.click", { handle: "t1091" }, { words: { target: "×" } }),
      step(3, "web.type", { handle: "t11" }, { words: { target: "Search", text: "paper towels" } }),
      step(4, "web.click", { handle: "t404" })
    ];
    const lines = value(steps).steps as Array<Record<string, unknown>>;
    expect(lines.map((line) => line.does)).toEqual([{ target: "12 Double Rolls" }, { target: "×" }, { target: "Search", text: "paper towels" }, undefined]);
    expect(lines[1]?.input).toEqual({ handle: "t1091" });
    expect(lines[3]).not.toHaveProperty("does");
    // The authored telling says what does is for.
    const authored = automationStudioFlowDraftEntry({ steps, authored: true })!.value as Entry;
    expect(authored.instruction).toContain("does, beside a step, names the control it acted on and the words it typed: name an act only on a step whose does is that act.");
  });

  // t174's control and t193's does name the same control; a line says it once.
  it("shows control only on a step the domain gave no does", () => {
    const lines = value([
      step(1, "web.click", { handle: "t1082" }, { words: { target: "Not now" }, control: "Not now" }),
      step(2, "web.click", { handle: "t1083" }, { control: "Add to cart" })
    ]).steps as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({ does: { target: "Not now" } });
    expect(lines[0]).not.toHaveProperty("control");
    expect(lines[1]).toMatchObject({ control: "Add to cart" });
    expect(lines[1]).not.toHaveProperty("does");
  });
});

// t252: a step may be written rather than run, its arguments may be bound, and
// the inputs the bindings declare are listed once for the whole draft.
describe("written steps, bindings and inputs in the draft entry", () => {
  const nodeStep = (position: number, parameters: Record<string, unknown>, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    position, iteration: position, actionId: "node.act", input: { node: "node.act", parameters } as never, ranWith: { node: "node.act", parameters } as never,
    effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", ...over
  });

  it("marks a written step written and in the Flow, never did_not_work", () => {
    const lines = value([nodeStep(1, {}, { written: true, effectApplied: false, resultCode: "core.run_node.written" })]).steps as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({ written: true, inResult: true, disposition: "kept" });
    const recorded = value([nodeStep(1, {})]).steps as Array<Record<string, unknown>>;
    expect(recorded[0]).not.toHaveProperty("written");
  });

  it("shows stored bindings in the forms the model writes, and lists the inputs they declare", () => {
    const entry = value([
      nodeStep(1, { query: { $state: { path: "query", fallback: "blue towels" } } }),
      nodeStep(2, { note: { $state: { path: "item.name" } } })
    ]) as Entry & { inputs?: unknown };
    expect(entry.steps[0]?.input).toEqual({ node: "node.act", parameters: { query: { $input: "query", test: "blue towels" } } });
    expect(entry.steps[1]?.input).toEqual({ node: "node.act", parameters: { note: { $row: "name" } } });
    expect(entry.inputs).toEqual([{ name: "query", test: "blue towels", steps: [1] }]);
    expect(JSON.stringify(entry)).not.toContain("$state");
    expect(value([nodeStep(1, { query: "x" })])).not.toHaveProperty("inputs");
  });

  it("shows passes beside a replayed step when its replay carries them", () => {
    const replayed = { step: 1, actionId: "node.act", status: "replayed" as const };
    const lines = value([nodeStep(1, {}, { replayed: { ...replayed, passes: 3 } as never }), nodeStep(2, {}, { replayed })]).steps as Array<Record<string, unknown>>;
    expect(lines[0]).toMatchObject({ replayed: "replayed", passes: 3 });
    expect(lines[1]).not.toHaveProperty("passes");
  });

  it("tells an authoring model it may write a step, bind a value, and that repetitive work is a loop", () => {
    const { instruction } = automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry;
    expect(instruction).toContain("write true");
    expect(instruction).toContain("written true");
    expect(instruction).toContain("{\"$input\": <name>, \"test\": <value>}");
    expect(instruction).toContain("{\"$row\": <field>}");
    expect(instruction).toContain("amend_draft bind");
    expect(instruction).toContain("inputs");
    expect(instruction).toContain("passes");
    expect(instruction).toMatch(/never do it to every item yourself/u);
  });

  // Live run `run-mustzxhi-2e2cda87` bound a press's target about 12 times on
  // "a value that changes between runs or rows is bound".
  it("narrows binding to a value a step typed, or a read's condition, and says a press's control or option is never bound", () => {
    const { instruction } = automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry;
    expect(instruction).not.toContain("A value that changes between runs or rows is bound");
    expect(instruction).toContain("a value a step typed, or a read's condition");
    expect(instruction).toContain("press's control or option is never bound");
    expect(instruction).toContain("a repeat finds each row's own control in that row");
    expect(instruction).toContain("a single item's option is pressed as the page offers it");
  });
});

// Live run `run-musp474o-e0ed7432`: the attempt a rerun replaced was listed
// with the old where it ran with, like any step to fix, and the model reran it
// three times with the where its rerun already had. It is shown as replaced by
// its rerun, by the number that rerun now has, and without its old argument.
describe("the attempt a rerun replaced", () => {
  const receipt = (position: number, id: string, replacedBy: string): AutomationStudioFlowDraftStep =>
    step(position, "list", { where: "old" }, { id, effect: "observe", proposes: true, disposition: "dropped", replacedBy, resultCode: "ok", acts: ["a1"] });

  it("is shown as replaced by the step that took its place, without the argument it ran with", () => {
    const steps = [
      step(1, "list", { where: "fixed" }, { id: "d18", effect: "observe", proposes: true }),
      step(2, "press", { target: "t1" }, { id: "d7" }),
      receipt(3, "d6", "d18")
    ];
    const shown = automationStudioFlowDraftEntry({ steps, authored: true })!.value as Entry;
    expect(shown.steps[2]).toEqual({ step: 3, actionId: "list", replacedBy: 1, inResult: false });
    expect(shown.steps[0]).toMatchObject({ step: 1, input: { where: "fixed" }, inResult: true });
    expect(shown.instruction).toContain("A step showing replacedBy is the attempt a rerun replaced");
    // Said only where such an attempt is listed.
    expect(value(steps.slice(0, 2)).instruction).not.toContain("replacedBy");
  });

  it("names the step standing now when the rerun was replaced in turn", () => {
    const steps = [
      step(1, "list", { where: "newest" }, { id: "d20", effect: "observe", proposes: true }),
      receipt(2, "d6", "d18"),
      receipt(3, "d18", "d20")
    ];
    const shown = value(steps);
    expect(shown.steps.slice(1).map((line) => (line as Record<string, unknown>).replacedBy)).toEqual([1, 1]);
  });
});

// Live run `run-musr9pv3-f4bf6256` (t195 w45): a stray repeat from a decision
// whose numbers Core read one amendment at a time.
describe("what both tellings say about numbering", () => {
  it("says every number in one decision is the number the draft shows, in both tellings", () => {
    const authored = (automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry).instruction;
    const transcript = value([step(1, "press", { target: "t" })]).instruction;
    for (const instruction of [authored, transcript]) {
      expect(instruction).toContain("Every number in one amend_draft is this draft's; it is renumbered after the decision.");
    }
  });
});

// Live run B7 (t262): the draft showed a click's `target`, the click ran with a
// resolved selector and element, and the model bound `target` five times. The
// draft now says beside a kept step which of its shown values it ran with
// alike: those are what `bind` can lift (`../bindable/paths.ts`).
describe("what a kept step offers bind, run B7", () => {
  const typed = (over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
    ...step(1, "fixture.type", {}),
    input: { node: "fixture.type", parameters: { target: { handle: "fixture-handle" }, text: "fixture-text" } },
    ranWith: { node: "fixture.type", parameters: { selector: "private-locator", element: { identity: "private-identity" }, text: "fixture-text" } },
    ...over
  });

  it("lists the typed value the step ran with beside its unchanged input, and never the control or its private identity", () => {
    const recorded = typed();
    const before = structuredClone(recorded);
    const shown = value([recorded]);
    expect(shown.steps[0]).toMatchObject({ input: before.input, bindable: ["text"] });
    expect(shown.instruction).toContain("bindable, beside a step, lists the only values of its input it ran with as shown");
    expect(JSON.stringify(shown)).not.toMatch(/private-locator|private-identity|"selector"|"element"/u);
    expect(recorded).toEqual(before);
  });

  it("lists an empty bindable on a press that ran with none of its shown input, and never names what it resolved to", () => {
    const press = step(1, "press", {}, { input: { parameters: { target: { handle: "fixture-handle" } } }, ranWith: { parameters: { selector: "private-locator" } } });
    const shown = value([press]);
    expect(shown.steps[0]).toMatchObject({ input: { parameters: { target: { handle: "fixture-handle" } } }, bindable: [] });
    expect(shown.instruction).toContain("bindable");
    expect(JSON.stringify(shown)).not.toContain("private-locator");
  });

  it("lists nothing, and says nothing of it, for a step that ran with its input as shown or a step not in the Flow", () => {
    const asShown = step(1, "search", { query: "fixture-query" }, { ranWith: { query: "fixture-query" } });
    const shown = value([asShown, step(2, "search", { query: "fixture-query" }), typed({ position: 3, disposition: "dropped" })]);
    for (const line of shown.steps) expect(line).not.toHaveProperty("bindable");
    expect(shown.instruction).not.toContain("bindable");
  });

  it("reads a checked candidate's own current argument, never the one its earlier execution ran with", () => {
    const original = typed({ ranWith: { node: "fixture.type", parameters: { text: "private-original" } } });
    const candidate = typed({ effectApplied: false, checkedCandidate: { callId: "checked", code: "core.replay.present" }, priorExecution: { ...original, lasting: true } });
    const shown = value([candidate]);
    expect(shown.steps[0]).toMatchObject({ bindable: ["text"], checkedCandidate: { performed: false } });
    expect(JSON.stringify(shown)).not.toContain("private-");
  });
});

// D phase 2 (t273 S2): the route the person named, shown once the build's read
// of it has settled, and the places each step says it is on.
describe("the route the person named", () => {
  const steps = (): AutomationStudioFlowDraftStep[] => [
    step(1, "go", { url: "https://social.test/" }, { places: ["r1"] }),
    step(2, "press", { target: "friends" }, { acts: ["a1"], places: ["r1", "r2"] }),
    step(3, "press", { target: "remove" })
  ];
  const shown = (route?: Parameters<typeof automationStudioFlowDraftEntry>[0]["route"]): Entry & { route?: unknown } =>
    automationStudioFlowDraftEntry({ steps: steps(), authored: true, ...(route ? { route } : {}) })!.value as Entry & { route?: unknown };

  it("shows a named route in the person's words, each place by id, and how to say which steps are on each", () => {
    const value = shown({ state: "named", quote: "go to my profile, then Friends", places: ["my profile", "Friends"] });
    expect(value.route).toEqual({ named: "go to my profile, then Friends", places: { r1: "my profile", r2: "Friends" } });
    expect(value.instruction).toMatch(/goes through every place[^.]*in order/u);
    expect(value.instruction).toMatch(/first step never goes deeper than r1/u);
    expect(value.instruction).toContain("\"r1,r2\"");
    expect(value.instruction).toMatch(/none/u);
    expect(value.instruction).toMatch(/[Cc]ompletion is refused while a place has no step in the Flow[^.]*out of order/u);
    expect(value.instruction).not.toMatch(/named no route/u);
  });

  it("shows an open route as open, and that the first step may go straight to where the work begins", () => {
    const value = shown({ state: "open" });
    expect(value.route).toBe("open");
    expect(value.instruction).toMatch(/named no route[^.]*first step may go straight to where the work begins/u);
    expect(value.instruction).not.toMatch(/goes through every place/u);
  });

  it("shows each step's places after its act", () => {
    const value = shown({ state: "named", quote: "q", places: ["a", "b"] });
    expect(value.steps.map((line) => (line as { place?: string }).place)).toEqual(["r1", "r1,r2", undefined]);
    const keys = Object.keys(value.steps[1]!);
    expect(keys.indexOf("place")).toBe(keys.indexOf("act") + 1);
  });

  it("adds nothing when no route has been read", () => {
    const value = shown();
    expect(value).not.toHaveProperty("route");
    expect(value.instruction).toBe((automationStudioFlowDraftEntry({ steps: [step(1, "press", { target: "t" })], authored: true })!.value as Entry).instruction);
  });
});
