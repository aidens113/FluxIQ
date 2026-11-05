// @fluxiq-test-group real-sql
// A saved step on a control its attempt saw flip (t869, `../stated-toggles.ts`, `../stamped-plan.ts`),
// through a real service, the real engine and the real permission gate, on a lending library's hold
// shelf: a switch each press flips, as a toggle site's Save does. Unrelated to any realistic scenario.
//
// The step declares nothing and claims nothing, which is the case Core cannot tell is a toggle: what
// holds it is the state the attempt saw it flip to, checked before the press, and the press's own
// word that it flipped, which holds it to a look in a later attempt.

import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstFlowRunAssemble, automationStudioAnswerFirstStatedToggles } from "../index.ts";
import type { AutomationStudioExploredToggle } from "../../../../../../runtime/flow-authoring/bootstrap/script-statements/index.ts";
import { flowRunFixture, HOLD_SHELF, savedStep, type FlowRunFixture } from "../../tests/fake-library-engine.ts";
import type { AutomationStudioAnswerFirstFlowRunEngine } from "../ports.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const STEPS = [savedStep(1, HOLD_SHELF, { control: "Keep on hold" }, { label: "Keep on hold" })];
const SAVED = { steps: STEPS, stepsDigest: "digest.hold" };
/** What a web domain says of every press: a page decides what it does (`../../run-acts/settling.ts`). */
const committing = (engine: AutomationStudioAnswerFirstFlowRunEngine): AutomationStudioAnswerFirstFlowRunEngine => ({
  ...engine, graphOptions: (input) => ({ ...engine.graphOptions(input), resolveActionEffect: () => ({ effectClass: "commit" as const, permissionConsequences: [] }) })
});

async function statedAfter(fixture: FlowRunFixture, explored: readonly AutomationStudioExploredToggle[] = fixture.permissions.exploredToggles.list()) {
  const assembly = await automationStudioAnswerFirstFlowRunAssemble(fixture.ports, STEPS);
  if (!assembly.ok) throw new Error(`not assembled: ${assembly.codes.join(", ")}`);
  const { registry, resolution } = fixture.ports.input;
  return automationStudioAnswerFirstStatedToggles({
    buildPlan: assembly.buildPlan, locator: assembly.locator, explored, saved: STEPS,
    takesEnsureState: (definitionId) => registry.get(definitionId, resolution)?.parameters.some((parameter) => parameter.id === "ensureState") === true
  });
}

describe("a step on a control the attempt saw flip", () => {
  it("is given the state that press left, and a later run checks it and presses nothing", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const first = await automationStudioAnswerFirstFlowRun(fixture.ports, SAVED);
    expect(first, JSON.stringify(first)).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.onHold).toBe(true);
    const stated = await statedAfter(fixture);
    expect(stated).toEqual([{ step: "saved.1", ensureState: { state: "on" } }]);
    // A later attempt's run, with a record that knows nothing: the state alone keeps the switch where it is.
    const later = await flowRunFixture({ target: fixture.target }, cleanups);
    const second = await automationStudioAnswerFirstFlowRun(later.ports, { ...SAVED, stated });
    expect(second).toMatchObject({ kind: "ran", reachedEnd: true, steps: [expect.objectContaining({ ran: "skipped" })] });
    expect(fixture.target.library.onHold).toBe(true);
    expect(fixture.target.presses).toHaveLength(1);
    expect(later.record.data().acts).toEqual([]);
  });

  it("still presses where the switch is not in that state yet: a row the first attempt never reached", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { ...SAVED, stated: [{ step: "saved.1", ensureState: { state: "on" } }] });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.onHold).toBe(true);
    expect(fixture.target.presses).toHaveLength(1);
  });

  // What the state is there to stop. Every later run keeps it, a person's Run again included (`../../tests/same-words.test.ts`).
  it("with no state known, a later run presses again and the switch goes back", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    await automationStudioAnswerFirstFlowRun(fixture.ports, SAVED);
    const again = await flowRunFixture({ target: fixture.target }, cleanups);
    await automationStudioAnswerFirstFlowRun(again.ports, SAVED);
    expect(fixture.target.library.onHold).toBe(false);
    expect(fixture.target.presses).toHaveLength(2);
  });

  it("a state the observations do not agree on is not given", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    await automationStudioAnswerFirstFlowRun(fixture.ports, SAVED);
    const [seen] = fixture.permissions.exploredToggles.list();
    expect(seen).toBeDefined();
    // A second sighting that says the press left the switch where it found it.
    expect(await statedAfter(fixture, [seen!, { ...seen!, beforeSignature: seen!.signature }])).toEqual([]);
  });
});

describe("the same press, held by what it said of itself", () => {
  it("is on the record as having flipped, and a later attempt's run holds it to a look rather than pressing it blind", async () => {
    const fixture = await flowRunFixture({ engine: committing }, cleanups);
    await automationStudioAnswerFirstFlowRun(fixture.ports, SAVED);
    expect(fixture.record.data().acts).toEqual([expect.objectContaining({ undeclared: true, changedState: true, state: "may_have_landed" })]);
    const seeded = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: fixture.record.data() })! });
    const later = await flowRunFixture({ target: fixture.target, record: seeded, engine: committing }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(later.ports, SAVED);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.onHold).toBe(true);
    expect(fixture.target.presses).toHaveLength(1);
  });

  it("within its own run it is pressed as often as the Flow says, as any plain press is", async () => {
    const fixture = await flowRunFixture({ engine: committing }, cleanups);
    const twice = [STEPS[0]!, savedStep(2, HOLD_SHELF, { control: "Keep on hold" }, { label: "Keep on hold" })];
    await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: twice, stepsDigest: "digest.twice" });
    expect(fixture.target.presses).toHaveLength(2);
  });
});
