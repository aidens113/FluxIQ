// @fluxiq-test-group real-sql
// A checked state written into a Flow whose stated step sits inside a repeat (t869): the plan laid out
// again keeps the repeat, so each pass still runs, and the switch the state guards is pressed once. On
// the lending library, unrelated to any realistic scenario.

import { afterEach, describe, expect, it } from "vitest";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstFlowRunAssemble, automationStudioAnswerFirstStampedPlan } from "../index.ts";
import { flowRunFixture, HOLD_SHELF, LOANS_OUTPUT, savedStep } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_LOAN } from "../../tests/fake-library.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const STEPS = [
  savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list of loans" }),
  savedStep(2, RENEW_LOAN, { control: "Renew" }, { consequences: ["modify_existing"], routing: { kind: "repeat", through: "saved.3", over: "saved.1" }, label: "Renew" }),
  savedStep(3, HOLD_SHELF, { control: "Keep on hold" }, { label: "Keep on hold" })
];
const STATED = [{ step: "saved.3", ensureState: { state: "on" } }];

describe("a checked state inside a repeat", () => {
  it("keeps the plan's parts as they were, the state alone added", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const assembly = await automationStudioAnswerFirstFlowRunAssemble(fixture.ports, STEPS);
    if (!assembly.ok) throw new Error(`not assembled: ${assembly.codes.join(", ")}`);
    const stamped = automationStudioAnswerFirstStampedPlan(fixture.ports.input, assembly.buildPlan, assembly.locator, STEPS, STATED);
    expect(JSON.stringify(stamped.plan)).toContain("ensureState");
    const strip = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, each) => (key === "ensureState" ? undefined : each)));
    expect(strip(stamped.subflows)).toEqual(strip(assembly.buildPlan.subflows));
    expect(strip(stamped.plan)).toEqual(strip(assembly.buildPlan.plan));
  });

  it("runs every pass, and presses the switch once", async () => {
    const fixture = await flowRunFixture({}, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: STEPS, stepsDigest: "digest.repeat", stated: STATED });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.presses.filter((press) => press.node === RENEW_LOAN)).toHaveLength(3);
    expect(fixture.target.library.onHold).toBe(true);
    expect(fixture.target.presses.filter((press) => press.node === HOLD_SHELF)).toHaveLength(1);
  });
});
