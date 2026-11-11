// @fluxiq-test-group real-sql
// A person's press on a FluxNode's attempt runs under that attempt's overrides (W3, t899), through the real
// service with a scripted model and the lending library: the frame the run set is kept with the attempt, and a
// Carry on or Run again, which come from the panel outside any FluxNode run, set it again around the attempt.
// What the model's turn sees is `automationStudioRunOverrides()` read inside the scripted decision.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioAnswerFirstCallerOptions } from "../../../flow-bootstrap-commands/index.ts";
import { automationStudioRunOverrides, runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../../../../../../runtime/run-overrides/index.ts";
import { automationStudioAnswerFirstCarryOn } from "../../index.ts";
import { complete } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";
import { drivenBy } from "./caller-driven.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

type Options = AutomationStudioAnswerFirstCallerOptions;
type Frame = Readonly<AutomationStudioRunOverrides> | undefined;

const LIST = "List every loan on my library account.";
const KEY = "library.loans:spec-1";
const FRAME: AutomationStudioRunOverrides = { nodeAttempts: 7, prompts: { "core.efficiency": { mode: "append", text: "Prefer fewer steps." } }, pace: { minStepGapMs: 5 }, digest: "d".repeat(64) };

/** A scripted read that records the frame it ran under. */
const seeing = (into: Frame[]) => (): ReturnType<typeof readLoans> => {
  into.push(automationStudioRunOverrides());
  return readLoans();
};

async function lane(first: Options | undefined) {
  const made = await laterAttempts(cleanups);
  const options: { now: Options | undefined } = { now: first };
  drivenBy(made.service, () => options.now);
  return { lane: made, options };
}

describe("a press on a FluxNode's attempt runs under the attempt's overrides", () => {
  it("Run again sets the frame the attempt kept, though the press runs outside any frame", async () => {
    const { lane: made, options } = await lane({ taskKey: KEY, judge: "off", runOverrides: FRAME });
    const seen: Frame[] = [];
    // The FluxNode run sets the frame itself, as `runFluxNode` does, and the attempt keeps it.
    const first = await runWithAutomationStudioRunOverrides(FRAME, async () => await made.attempt({ instruction: LIST, script: [seeing(seen), complete("Listed.")] }));
    expect(first.answer.attempt.status).toBe("achieved");
    expect(seen).toEqual([FRAME]);
    expect((await made.kept())?.attempts.map((attempt) => attempt.caller?.runOverrides)).toEqual([FRAME]);

    options.now = undefined;
    expect(automationStudioRunOverrides()).toBeUndefined();
    const pressedSeen: Frame[] = [];
    const again = await made.attempt({ instruction: LIST, runAgain: true, script: [seeing(pressedSeen), complete("Listed.")] });
    expect(again.answer.attempt).toMatchObject({ status: "achieved", ordinal: 2 });
    // The saved Flow replays on a Run again, so the model may not be asked at all; what it is asked, it is asked under the frame.
    for (const frame of pressedSeen) expect(frame).toEqual(FRAME);
    expect((await made.kept())?.attempts.map((attempt) => attempt.caller?.runOverrides)).toEqual([FRAME, FRAME]);
    expect(automationStudioRunOverrides()).toBeUndefined();
  });

  it("Carry on sets the frame the attempt kept", async () => {
    const { lane: made, options } = await lane({ taskKey: KEY, judge: "off", runOverrides: FRAME });
    const first = await runWithAutomationStudioRunOverrides(FRAME, async () => await made.attempt({ instruction: LIST, costUsd: 0.04, maxTotalEstimatedCostUsd: 0.09, keepLooking: true, script: [readLoans()] }));
    expect(first.answer.attempt.status).toBe("budget_out");

    options.now = undefined;
    const seen: Frame[] = [];
    const pressed = await automationStudioAnswerFirstCarryOn(made.service, made.stores, { projectId: made.projectId, attemptId: first.answer.attempt.attemptId, addUsd: 0.4 }, () => made.attempt({ instruction: LIST, costUsd: 0.04, script: [seeing(seen), complete("Listed.")] }));
    if (!pressed.ok) throw new Error(`refused: ${pressed.refused}`);
    const after = await pressed.finished;
    expect(after.answer.attempt).toMatchObject({ status: "achieved", attemptId: first.answer.attempt.attemptId });
    expect(seen).toEqual([FRAME]);
  });

  it("never replaces a frame already set around the attempt, which is a FluxNode run's own", async () => {
    const { lane: made } = await lane({ taskKey: KEY, judge: "off", runOverrides: FRAME });
    const outer: AutomationStudioRunOverrides = { nodeAttempts: 2 };
    const seen: Frame[] = [];
    await runWithAutomationStudioRunOverrides(outer, async () => await made.attempt({ instruction: LIST, script: [seeing(seen), complete("Listed.")] }));
    expect(seen).toEqual([outer]);
  });

  it("gives a press on an attempt with no frame none, and a call that brings a frame runs under it", async () => {
    const { lane: made, options } = await lane({ taskKey: KEY, judge: "off" });
    const seen: Frame[] = [];
    await made.attempt({ instruction: LIST, script: [seeing(seen), complete("Listed.")] });
    options.now = undefined;
    const pressedSeen: Frame[] = [];
    await made.attempt({ instruction: LIST, runAgain: true, script: [seeing(pressedSeen), complete("Listed.")] });
    expect([...seen, ...pressedSeen].every((frame) => frame === undefined)).toBe(true);
    expect((await made.kept())?.attempts.every((attempt) => attempt.caller?.runOverrides === undefined)).toBe(true);

    options.now = { taskKey: "library.other:spec-2", judge: "off", runOverrides: FRAME };
    const own: Frame[] = [];
    await made.attempt({ instruction: "List my loans, newest first.", script: [seeing(own), complete("Listed.")] });
    expect(own).toEqual([FRAME]);
  });
});
