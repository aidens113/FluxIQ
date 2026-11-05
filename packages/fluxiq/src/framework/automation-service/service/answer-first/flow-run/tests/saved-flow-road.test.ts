// @fluxiq-test-group real-sql
// A saved Flow's road through the real engine and the real assembly (t869): a step that claims a
// lasting act against a plain press, a control already in its state, and a prompt the page remembers
// declining or raises again. No model, Lab or browser; a lending library stands in, unrelated to any
// realistic scenario. The floor is what a domain really says of every press: it commits.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstFlowRunEngine } from "../index.ts";
import { automationStudioAnswerFirstFlowRun, automationStudioAnswerFirstFlowRunActClaims, automationStudioAnswerFirstFlowRunAssemble } from "../index.ts";
import { CLOSE_PROMPT, flowRunFixture, LOANS_OUTPUT, OPEN_ACCOUNT, RENEW_BY_OUTPUT, savedStep } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const floorOnEveryPress = (engine: AutomationStudioAnswerFirstFlowRunEngine): AutomationStudioAnswerFirstFlowRunEngine => ({
  ...engine,
  graphOptions: (input) => ({ ...engine.graphOptions(input), resolveActionEffect: (node) => node.definitionId === RENEW_CARD || node.definitionId === CLOSE_PROMPT ? { effectClass: "commit", permissionConsequences: [] } : undefined })
});
const card = (position: number, over: Parameters<typeof savedStep>[3] = {}, more: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({ ...savedStep(position, RENEW_CARD, { control: "Renew" }, { label: "the card", ...over }), effect: "mutate", ...more });
/** The run, saying which issues kept saved steps from assembling. */
const ran = async (fixture: Awaited<ReturnType<typeof flowRunFixture>>, steps: AutomationStudioFlowDraftStep[]) => {
  const assembled = await automationStudioAnswerFirstFlowRunAssemble(fixture.ports, steps);
  if (!assembled.ok) throw new Error(`did not assemble: ${[...assembled.codes, ...(assembled.issues ?? [])].join(", ")}`);
  return await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest" });
};
const start = (position = 1) => savedStep(position, OPEN_ACCOUNT, { url: "https://library.example/account" }, { label: "the account" });

describe("the same control pressed twice on a saved Flow", () => {
  it("a plain press runs both times, and the Flow reaches its end", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, instruction: "List my loans." }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: [start(), card(2), card(3)], stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.renewals.card).toBe(2);
    expect(fixture.record.acts()).toEqual([]);
  });

  it("a declared press runs once, and the step after it still runs", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, permittedConsequences: ["modify_existing"], instruction: "List my loans." }, cleanups);
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: [start(), card(2, { consequences: ["modify_existing"] }), card(3, { consequences: ["modify_existing"] })], stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.renewals.card).toBe(1);
    expect(fixture.record.acts()).toEqual([expect.objectContaining({ state: "landed", classes: ["modify_existing"] })]);
  });

  it("a press whose step claims a lasting act of the request runs once, though it declared nothing", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, instruction: "Save the card to my favourites." }, cleanups);
    const steps = [start(), card(2, {}, { acts: ["a1"] }), card(3)];
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(fixture.target.library.renewals.card).toBe(1);
  });
});

describe("which steps claim a lasting act", () => {
  const claims = async (instruction: string, acts: string[]) => {
    const fixture = await flowRunFixture({ instruction }, cleanups);
    const steps = [start(), card(2, {}, { acts })];
    const assembled = await automationStudioAnswerFirstFlowRunAssemble(fixture.ports, steps);
    if (!assembled.ok) throw new Error(`did not assemble: ${assembled.codes.join(", ")}`);
    return automationStudioAnswerFirstFlowRunActClaims({ buildPlan: assembled.buildPlan, locator: assembled.locator, saved: steps, instructionText: instruction }).size;
  };

  it("a claim of an act that stays done, and never a setting, an opening or a choice of an act", async () => {
    expect(await claims("Save the card to my favourites.", ["a1"])).toBe(1);
    expect(await claims("Sort the loans by date.", ["a1"])).toBe(0);
    expect(await claims("Save the card to my favourites.", ["a1.colour"])).toBe(0);
    expect(await claims("Save the card to my favourites.", [])).toBe(0);
  });
});

describe("a control already in its asked state", () => {
  /** The door a web step really uses: the node answers, and its press goes out as an output, which the page answers. */
  const pressedNothing = (engine: AutomationStudioAnswerFirstFlowRunEngine): AutomationStudioAnswerFirstFlowRunEngine => ({
    ...engine,
    graphOptions: (input) => ({
      ...engine.graphOptions(input),
      resolveActionEffect: (node) => node.definitionId === RENEW_BY_OUTPUT ? { effectClass: "commit", permissionConsequences: [] } : undefined,
      effectDispatcher: async () => ({ status: "success", route: "success", outputs: { result: { skipped: "already_in_state" } } })
    })
  });
  const check = savedStep(2, RENEW_BY_OUTPUT, { control: "Renew" }, { label: "the card", consequences: ["modify_existing"] });

  it("reads as not pressed: on the record, on the card, and in what the run says it did", async () => {
    const fixture = await flowRunFixture({ engine: pressedNothing, permittedConsequences: ["modify_existing"], instruction: "List my loans." }, cleanups);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const outcome = await runWithAutomationStudioActivity({ kind: "run", id: "run.road", projectId: fixture.projectId }, () => ran(fixture, [start(), check])).finally(unsubscribe);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, steps: expect.arrayContaining([expect.objectContaining({ position: 2, ran: "skipped", happened: "Its control already showed the asked state, so it was not pressed." })]) });
    expect(fixture.record.acts()).toEqual([]);
    expect(fixture.record.data().acts).toEqual([]);
    const said = seen.map((event) => JSON.stringify(event));
    expect(said.some((line) => line.includes("already_in_state") && line.includes("Not pressed"))).toBe(true);
    expect(said.some((line) => line.includes("Changed something"))).toBe(false);
  });
});

describe("a prompt the page sometimes raises, and the step that answers it", () => {
  const closePrompt = (position: number, more: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({ ...savedStep(position, CLOSE_PROMPT, { control: "Close" }, { label: "the prompt" }), effect: "mutate", ...more });
  const PROMPT_PRESS = (position: number) => closePrompt(position, { interruption: true });
  const pressesOfThePrompt = (fixture: Awaited<ReturnType<typeof flowRunFixture>>) => fixture.target.presses.filter((press) => press.node === CLOSE_PROMPT).length;
  const absentOnce = () => ({ status: "failed" as const, route: "failed", outputs: {}, message: "Not on the page.", failure: { category: "target_not_found" as const, code: "library.absent", retryable: false, stage: "target_resolution" as const, effect: "unacted" as const } });

  it("absent: the run passes over it, says so, and goes on to its end", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, instruction: "List my loans." }, cleanups);
    fixture.target.over = ({ nodeId }) => nodeId === CLOSE_PROMPT ? absentOnce() : undefined;
    const outcome = await ran(fixture, [start(), PROMPT_PRESS(2), savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list" })]);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, steps: expect.arrayContaining([expect.objectContaining({ position: 2, ran: "skipped" }), expect.objectContaining({ position: 3, ran: "passed" })]) });
    expect(pressesOfThePrompt(fixture)).toBe(0);
    expect(fixture.target.reads).toBe(1);
    expect(fixture.record.acts()).toEqual([]);
  });

  it("there: it is pressed, and the run goes on to its end", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, instruction: "List my loans." }, cleanups);
    const outcome = await ran(fixture, [start(), PROMPT_PRESS(2), savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list" })]);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true, steps: expect.arrayContaining([expect.objectContaining({ position: 2, ran: "passed" }), expect.objectContaining({ position: 3, ran: "passed" })]) });
    expect(pressesOfThePrompt(fixture)).toBe(1);
    expect(fixture.target.reads).toBe(1);
  });

  it("the same step not said to answer a prompt stops the run where it is absent: the saved steps from before this say nothing of it, and the rounds carry on from there", async () => {
    const fixture = await flowRunFixture({ engine: floorOnEveryPress, instruction: "List my loans." }, cleanups);
    fixture.target.over = ({ nodeId }) => nodeId === CLOSE_PROMPT ? absentOnce() : undefined;
    const outcome = await ran(fixture, [start(), closePrompt(2), savedStep(3, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list" })]);
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false, failing: expect.objectContaining({ position: 2 }) });
  });
});
