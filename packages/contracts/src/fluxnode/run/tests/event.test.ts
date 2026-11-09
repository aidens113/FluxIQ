// Run events and the program's answers to them.
import { describe, expect, it } from "vitest";
import { fluxNodeAnswerFitsEvent, parseFluxNodeEventAnswer, parseFluxNodeRunEvent, type FluxNodeEventAnswer, type FluxNodeRunEvent } from "../index.ts";

const COMMON = { runId: "run_1", at: 1_000 };

describe("parseFluxNodeRunEvent", () => {
  it("accepts every event type", () => {
    const events = [
      { ...COMMON, seq: 1, type: "step", flowId: "flow_9", stepId: "s1", label: "Open the results", state: "retrying", attempt: 2 },
      { ...COMMON, seq: 2, type: "person_needed", eventId: "e1", need: "sign_in", reason: "Sign in to market.example.", waitUntil: 9_000 },
      { ...COMMON, seq: 3, type: "check_needed", eventId: "e2", outputs: { listings: [] }, inputs: { count: 3 } },
      { ...COMMON, seq: 4, type: "transform_needed", eventId: "e3", stepId: "enrich", callback: "enrichListing", records: [{ a: 1 }] },
      { ...COMMON, seq: 5, type: "cost", cost: { calls: 2, tokens: 900, usd: 0.01 }, budgetUsd: 5 }
    ];
    for (const event of events) expect(parseFluxNodeRunEvent(event).ok, event.type).toBe(true);
  });

  it("refuses an unknown type, a zero seq and a non-JSON payload", () => {
    expect(parseFluxNodeRunEvent({ ...COMMON, seq: 1, type: "failed" }).ok).toBe(false);
    expect(parseFluxNodeRunEvent({ ...COMMON, seq: 0, type: "cost", cost: { calls: 0, tokens: 0, usd: 0 }, budgetUsd: 1 }).ok).toBe(false);
    expect(parseFluxNodeRunEvent({ ...COMMON, seq: 1, type: "check_needed", eventId: "e", outputs: { a: Number.NaN }, inputs: {} })).toMatchObject({ ok: false, issues: [{ path: "/outputs/a", code: "json.not_json" }] });
  });
});

describe("answers", () => {
  it("needs a reason for a failed check and none for a passed one", () => {
    expect(parseFluxNodeEventAnswer({ type: "check_answer", eventId: "e2", pass: false, reason: "wrong number of listings" }).ok).toBe(true);
    expect(parseFluxNodeEventAnswer({ type: "check_answer", eventId: "e2", pass: false })).toMatchObject({ ok: false, issues: [{ code: "answer.reason_missing" }] });
    expect(parseFluxNodeEventAnswer({ type: "check_answer", eventId: "e2", pass: true, reason: "x" })).toMatchObject({ ok: false, issues: [{ code: "answer.reason_unexpected" }] });
  });

  it("needs exactly one of records and error in a transform answer", () => {
    expect(parseFluxNodeEventAnswer({ type: "transform_answer", eventId: "e3", records: [] }).ok).toBe(true);
    expect(parseFluxNodeEventAnswer({ type: "transform_answer", eventId: "e3", error: "boom" }).ok).toBe(true);
    expect(parseFluxNodeEventAnswer({ type: "transform_answer", eventId: "e3" }).ok).toBe(false);
    expect(parseFluxNodeEventAnswer({ type: "transform_answer", eventId: "e3", records: [], error: "x" }).ok).toBe(false);
  });

  it("fits an answer to its event by id and kind", () => {
    const check: FluxNodeRunEvent = { ...COMMON, seq: 3, type: "check_needed", eventId: "e2", outputs: null, inputs: {} };
    const pass: FluxNodeEventAnswer = { type: "check_answer", eventId: "e2", pass: true };
    expect(fluxNodeAnswerFitsEvent(check, pass)).toBe(true);
    expect(fluxNodeAnswerFitsEvent(check, { type: "person_answer", eventId: "e2", outcome: "done" })).toBe(false);
    expect(fluxNodeAnswerFitsEvent(check, { ...pass, eventId: "other" })).toBe(false);
    expect(fluxNodeAnswerFitsEvent({ ...COMMON, seq: 5, type: "cost", cost: { calls: 0, tokens: 0, usd: 0 }, budgetUsd: 1 }, pass)).toBe(false);
  });
});
