import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstBeforeReadingsOf, automationStudioAnswerFirstEarlierBefore } from "../index.ts";

describe("automationStudioAnswerFirstBeforeReadingsOf", () => {
  it("holds a reading per attempt, per service, and the same store for the same service", () => {
    const one = {};
    const other = {};
    automationStudioAnswerFirstBeforeReadingsOf(one).keep("attempt.1", { at: "one" });
    expect(automationStudioAnswerFirstBeforeReadingsOf(one).get("attempt.1")).toEqual({ at: "one" });
    expect(automationStudioAnswerFirstBeforeReadingsOf(other).get("attempt.1")).toBeUndefined();
  });

  it("holds a bounded number, the oldest going first, and one kept again is the newest", () => {
    const readings = automationStudioAnswerFirstBeforeReadingsOf({});
    for (let at = 0; at < 40; at += 1) {
      readings.keep(`attempt.${at}`, { at });
      if (at === 30) readings.keep("attempt.0", { at: 0 });
    }
    expect(readings.get("attempt.0")).toEqual({ at: 0 });
    expect(readings.get("attempt.1")).toBeUndefined();
    expect(readings.get("attempt.8")).toBeUndefined();
    expect(readings.get("attempt.9")).toEqual({ at: 9 });
    expect(readings.get("attempt.39")).toEqual({ at: 39 });
  });
});

describe("automationStudioAnswerFirstEarlierBefore", () => {
  const readings = { get: (attemptId: string) => (attemptId === "attempt.held" ? { held: true } : undefined) };

  it("a new attempt carrying one attempt's acts starts from that attempt's reading where it is held", () => {
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: true, from: "attempt.held" })).toEqual({ before: { held: true } });
  });

  it("a new attempt whose earlier reading is not held, or that carries several attempts' acts, is told so", () => {
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: true, from: "attempt.gone" })).toEqual({});
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: true })).toEqual({});
  });

  it("a carry-on starts from its own reading where it is held, and is told nothing of an earlier attempt where not", () => {
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: true, from: "attempt.held", sameAttempt: true })).toEqual({ before: { held: true } });
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: true, from: "attempt.gone", sameAttempt: true })).toBeUndefined();
  });

  it("nothing carried is nothing", () => {
    expect(automationStudioAnswerFirstEarlierBefore(readings, { acts: false, from: "attempt.held" })).toBeUndefined();
  });
});
