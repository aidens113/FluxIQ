// Coverage of step-skip.ts: the closed skip a step row reports is read as the
// contract declares it, and anything outside that shape, or on a row that is
// not a step, is not read at all (t416).

import { expect, test } from "vitest";

import { stepSkip, type ClientGatewayActivity } from "../index.ts";

function event(detail: ClientGatewayActivity["detail"]): ClientGatewayActivity {
  return { activityId: "run:r1", sequence: 1, subject: { kind: "run", id: "r1", projectId: "p" }, phase: "running", label: "Already done for Lin Zhao", at: "2026-10-10T00:00:00.000Z", ...(detail ? { detail } : {}) };
}

function stepWith(skipped: unknown): ClientGatewayActivity {
  return event({ kind: "step", title: "Already done for Lin Zhao", status: "succeeded", ref: "n4.confirm", skipped } as ClientGatewayActivity["detail"]);
}

test("each of the contract's reasons is read, with its subject trimmed", () => {
  expect(stepSkip(stepWith({ reason: "already_done", subject: " Lin Zhao " }))).toStrictEqual({ reason: "already_done", subject: "Lin Zhao" });
  expect(stepSkip(stepWith({ reason: "optional_absent", subject: "Not now" }))).toStrictEqual({ reason: "optional_absent", subject: "Not now" });
  expect(stepSkip(stepWith({ reason: "state_routed" }))).toStrictEqual({ reason: "state_routed" });
  expect(stepSkip(stepWith({ reason: "already_in_state", subject: "Lin Zhao" }))).toStrictEqual({ reason: "already_in_state", subject: "Lin Zhao" });
});

test("a blank or non-string subject is left out", () => {
  expect(stepSkip(stepWith({ reason: "already_done", subject: "  " }))).toStrictEqual({ reason: "already_done" });
  expect(stepSkip(stepWith({ reason: "already_done", subject: 4 }))).toStrictEqual({ reason: "already_done" });
});

test("a skip outside the contract, or on a row that is not a step, is not read; an older row without the field reads none", () => {
  expect(stepSkip(stepWith({ reason: "guessed" }))).toBe(undefined);
  expect(stepSkip(stepWith("already_done"))).toBe(undefined);
  expect(stepSkip(stepWith(null))).toBe(undefined);
  expect(stepSkip(event({ kind: "tool", title: "Clicking", skipped: { reason: "already_done" } } as ClientGatewayActivity["detail"]))).toBe(undefined);
  expect(stepSkip(event({ kind: "step", title: "Already done for Lin Zhao", status: "succeeded", ref: "n4.confirm" }))).toBe(undefined);
  expect(stepSkip(event(undefined))).toBe(undefined);
});
