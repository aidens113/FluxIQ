// Coverage of step-recovery.ts: the closed recovery a step row reports is read
// as the contract declares it, and anything outside that shape, or on a row
// that is not a step, is not read at all.

import { expect, test } from "vitest";

import { stepRecovery, type ClientGatewayActivity } from "../index.ts";

function event(detail: ClientGatewayActivity["detail"]): ClientGatewayActivity {
  return { activityId: "run:r1", sequence: 1, subject: { kind: "run", id: "r1", projectId: "p" }, phase: "running", label: "Recovered: Dismiss the sign-in popup", at: "2026-10-09T00:00:00.000Z", ...(detail ? { detail } : {}) };
}

function stepWith(recovery: unknown): ClientGatewayActivity {
  return event({ kind: "step", title: "Dismiss the sign-in popup", status: "succeeded", ref: "node.add", recovery } as ClientGatewayActivity["detail"]);
}

test("a step row's handler recovery is read whole", () => {
  const recovery = { kind: "handler", subject: "Dismiss the sign-in popup", outcome: "succeeded", event: "before", targetId: "handler.popup" } as const;
  expect(stepRecovery(stepWith(recovery))).toStrictEqual(recovery);
});

test("an event is kept only on a handler recovery, and a route keeps its target", () => {
  expect(stepRecovery(stepWith({ kind: "route", subject: "Back to the cart", outcome: "refused", event: "fail", targetId: "checkpoint.cart" }))).toStrictEqual({ kind: "route", subject: "Back to the cart", outcome: "refused", targetId: "checkpoint.cart" });
});

test("a layer the extension closed is read as an interference recovery, without an event", () => {
  const recovery = { kind: "interference", subject: "Closed a notice the page put in the way", outcome: "succeeded" } as const;
  expect(stepRecovery(stepWith(recovery))).toStrictEqual(recovery);
  expect(stepRecovery(stepWith({ ...recovery, event: "before" }))).toStrictEqual(recovery);
});

test("a recovery outside the contract, without a subject, or on a row that is not a step is not read", () => {
  expect(stepRecovery(stepWith({ kind: "teleport", subject: "x", outcome: "succeeded" }))).toBe(undefined);
  expect(stepRecovery(stepWith({ kind: "entry", subject: "x", outcome: "maybe" }))).toBe(undefined);
  expect(stepRecovery(stepWith({ kind: "entry", subject: "  ", outcome: "succeeded" }))).toBe(undefined);
  expect(stepRecovery(stepWith("handler"))).toBe(undefined);
  expect(stepRecovery(event({ kind: "tool", title: "Clicking", recovery: { kind: "handler", subject: "x", outcome: "succeeded" } } as ClientGatewayActivity["detail"]))).toBe(undefined);
  expect(stepRecovery(event({ kind: "step", title: "Running step 1 of 3", status: "started" }))).toBe(undefined);
  expect(stepRecovery(event(undefined))).toBe(undefined);
});
