import { describe, expect, it } from "vitest";
import type { AutomationStudioLifecycleEvent } from "../../../../nodes/control-flow/index.ts";
import type { AutomationStudioHandlerDisposition, AutomationStudioLifecycleContinuation } from "../continuation.ts";
import { decideAutomationStudioDisposition, type AutomationStudioRouteCheck } from "../dispositions.ts";

function continuation(event: AutomationStudioLifecycleEvent, extra: Partial<AutomationStudioLifecycleContinuation> = {}): AutomationStudioLifecycleContinuation {
  return {
    framePath: ["inv-1"],
    nodeId: "press",
    phase: event === "fail" ? "failed" : event === "before_next" ? "before_next" : event === "retry" ? "before_retry" : "before_attempt",
    event,
    attemptNumber: 2,
    inputs: {},
    outputsSoFar: {},
    lastingActStatus: "none",
    ...extra
  };
}

const goodRoute: AutomationStudioRouteCheck = { found: true, when: "true", requiresBound: true, passesUncertainAct: false };
const RESUME: AutomationStudioHandlerDisposition = { kind: "resume" };
const ROUTE: AutomationStudioHandlerDisposition = { kind: "route", checkpointId: "cart" };
const RESOLVE: AutomationStudioHandlerDisposition = { kind: "resolve", outputs: { total: 3 } };
const UNHANDLED: AutomationStudioHandlerDisposition = { kind: "unhandled" };

function decide(event: AutomationStudioLifecycleEvent, written: AutomationStudioHandlerDisposition, extra: Partial<Parameters<typeof decideAutomationStudioDisposition>[0]> = {}) {
  return decideAutomationStudioDisposition({ continuation: continuation(event), written, completionCheck: "true", route: goodRoute, requiredOutputIds: ["total"], ...extra });
}

describe("handler dispositions by phase", () => {
  it.each(["start", "before", "retry", "before_next"] as const)("%s: resume continues, route moves, resolve is refused, unhandled continues the ladder", (event) => {
    expect(decide(event, RESUME)).toEqual({ kind: "resume" });
    expect(decide(event, ROUTE)).toEqual({ kind: "route", checkpointId: "cart" });
    expect(decide(event, RESOLVE)).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("resolve") });
    expect(decide(event, UNHANDLED)).toMatchObject({ kind: "unhandled" });
  });

  it("fail: resume is refused, route moves, resolve hands on the outputs, unhandled continues", () => {
    expect(decide("fail", RESUME)).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("resume") });
    expect(decide("fail", ROUTE)).toEqual({ kind: "route", checkpointId: "cart" });
    expect(decide("fail", RESOLVE)).toEqual({ kind: "resolve", outputs: { total: 3 } });
    expect(decide("fail", UNHANDLED)).toMatchObject({ kind: "unhandled" });
  });

  it("refuses a resolve that does not cover the output contract", () => {
    expect(decide("fail", { kind: "resolve", outputs: { other: 1 } })).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("total") });
    expect(decide("fail", { kind: "resolve", outputs: {} }, { requiredOutputIds: [] })).toEqual({ kind: "resolve", outputs: {} });
  });

  it("makes any disposition unhandled when the completion check is not true", () => {
    for (const truth of ["false", "unknown"] as const) {
      expect(decide("before", RESUME, { completionCheck: truth })).toMatchObject({ kind: "unhandled", reason: expect.stringContaining(truth) });
      expect(decide("fail", ROUTE, { completionCheck: truth })).toMatchObject({ kind: "unhandled" });
      expect(decide("fail", RESOLVE, { completionCheck: truth })).toMatchObject({ kind: "unhandled" });
    }
  });

  it("returns unhandled when the body failed", () => {
    expect(decide("before", RESUME, { bodyFailed: true })).toEqual({ kind: "unhandled", reason: "The handler's body failed.", code: "body_failed" });
  });

  it("refuses a route whose checkpoint is missing, does not hold, lacks a binding, or would pass an uncertain act", () => {
    expect(decide("fail", ROUTE, { route: { ...goodRoute, found: false } })).toMatchObject({ kind: "unhandled" });
    expect(decideAutomationStudioDisposition({ continuation: continuation("fail"), written: ROUTE, completionCheck: "true" })).toMatchObject({ kind: "unhandled" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, when: "unknown" } })).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("unknown") });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, when: "false" } })).toMatchObject({ kind: "unhandled" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, requiresBound: false } })).toMatchObject({ kind: "unhandled" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, passesUncertainAct: true } })).toMatchObject({ kind: "unhandled", reason: expect.stringContaining("uncertain") });
  });

  it("keeps where each unhandled came from as a closed code, and names the guard that refused a route (t411)", () => {
    expect(decide("fail", UNHANDLED)).toMatchObject({ code: "written_unhandled" });
    expect(decide("fail", RESUME)).toMatchObject({ code: "disposition_not_allowed" });
    expect(decide("fail", ROUTE, { completionCheck: "false" })).toMatchObject({ code: "completion_check_not_true" });
    expect(decide("fail", { kind: "resolve", outputs: {} })).toMatchObject({ code: "resolve_missing_outputs" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, found: false } })).toMatchObject({ code: "route_refused", guard: "checkpoint_not_found" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, when: "unknown" } })).toMatchObject({ code: "route_refused", guard: "checkpoint_not_holding" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, requiresBound: false } })).toMatchObject({ code: "route_refused", guard: "requires_unbound" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, passesUncertainAct: true } })).toMatchObject({ code: "route_refused", guard: "passes_uncertain_act" });
    expect(decide("fail", ROUTE, { route: { ...goodRoute, repeatsUnrecordedAct: true } })).toMatchObject({ code: "route_refused", guard: "repeats_unrecorded_act" });
  });

  it("never moves past an uncertain act, and no handler overrides a Core stop", () => {
    const uncertain = decideAutomationStudioDisposition({ continuation: continuation("fail", { lastingActStatus: "uncertain" }), written: RESOLVE, completionCheck: "true", requiredOutputIds: ["total"] });
    expect(uncertain).toMatchObject({ kind: "stop", stop: "outcome_uncertain" });
    for (const stop of ["pause", "cancel", "permission", "outcome_uncertain"] as const) {
      expect(decide("before", RESUME, { coreStop: stop })).toMatchObject({ kind: "stop", stop });
    }
  });
});
