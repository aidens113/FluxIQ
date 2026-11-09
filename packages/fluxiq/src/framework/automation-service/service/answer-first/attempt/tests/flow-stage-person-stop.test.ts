// @fluxiq-test-group real-sql
// A later attempt's saved Flow meets a check only a person can clear, on a step whose failed route
// presses something (`../flow-stage.ts`, `../../flow-run/person-check-port.ts`). The person's Stop on
// the check is their Stop of the attempt: the failed route's press never runs, the attempt ends
// stopped by the person, and no round, decision or judge call follows. Their Continue goes on from
// that step. Through the real service, the real engine and a scripted model; a lending library stands
// in, unrelated to any realistic scenario.
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioAnswerFirstStepsDigest } from "../../index.ts";
import { pendingAsk } from "../../tests/endings/support.ts";
import { CLOSE_PROMPT, LOANS_OUTPUT, savedStep } from "../../tests/fake-library-engine.ts";
import { complete, READ_LOANS, RENEW_CARD } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** Read; close a prompt, where the check stands, and when that fails press the card instead; read again. */
const steps = [
  savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }),
  savedStep(2, CLOSE_PROMPT, { control: "Close" }, { routing: { kind: "on_failed", to: "saved.3" } }),
  savedStep(3, RENEW_CARD, { control: "Renew" }),
  savedStep(4, READ_LOANS, { recordOutput: LOANS_OUTPUT })
];
const robotCheck = { status: "failed" as const, route: "failed", message: "A robot check covers the page.", failure: { category: "user_intervention_required" as const, code: "library.robot_check", retryable: false } };

/** A task explored once, whose kept steps are then these, and whose prompt is behind a check until `cleared`. */
async function laneWithCheck(cleared: () => boolean) {
  const lane = await laterAttempts(cleanups);
  await lane.attempt({ script: [readLoans(), complete("Listed.")] });
  await lane.changeKept((current) => ({ ...current, flowId: "flow.loans", best: { attemptId: "attempt.kept", flowId: "flow.loans", steps, stepsDigest: automationStudioAnswerFirstStepsDigest(steps), label: "unverified", provenWhole: false, savedAtMs: 1, spend: { calls: 1, usd: 0.01 } } }));
  lane.target.over = ({ nodeId }) => nodeId === CLOSE_PROMPT && !cleared() ? robotCheck : undefined;
  return lane;
}

const cardPresses = (lane: Awaited<ReturnType<typeof laterAttempts>>) => lane.target.presses.filter((press) => press.node === RENEW_CARD).length;

describe("a person's answer to a check on a saved Flow's step that has a failed route", () => {
  it("Stop ends the attempt as stopped by the person: the failed route's press never runs, and no round or model call follows", async () => {
    const lane = await laneWithCheck(() => false);
    // A round, were one to run, would have this to do: the test would see its decisions.
    const running = lane.attempt({ script: [readLoans(), complete("Listed.")] });
    const ask = await pendingAsk(lane.service, lane.projectId, "flow.loans", AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    await lane.service.conversations.answerAsk({ projectId: lane.projectId, askId: ask.askId, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION });
    const second = await running;
    expect(second.answer.attempt).toMatchObject({ status: "stopped_by_person", path: "run_flow" });
    expect(second.answer.attempt.endedAtMs).toBeDefined();
    expect(cardPresses(lane)).toBe(0);
    expect(lane.target.library.renewals.card).toBeUndefined();
    expect(lane.target.reads).toBe(1);
    expect(second.decisions).toHaveLength(0);
    expect(second.judgeCalls).toHaveLength(0);
  });

  it("Continue goes on from that step down its success route, presses nothing on the failed one, and the attempt is not stopped", async () => {
    let answered = false;
    const lane = await laneWithCheck(() => answered);
    const running = lane.attempt({ script: [readLoans(), complete("Listed.")] });
    const ask = await pendingAsk(lane.service, lane.projectId, "flow.loans", AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    answered = true;
    await lane.service.conversations.answerAsk({ projectId: lane.projectId, askId: ask.askId, kind: "choice", value: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION });
    const second = await running;
    expect(second.answer.attempt.status).not.toBe("stopped_by_person");
    expect(cardPresses(lane)).toBe(0);
    // The engine's two reads: the first step's, and the last one's after the check, which Continue reached without running the first again.
    expect(lane.target.reads).toBe(2);
  });
});
