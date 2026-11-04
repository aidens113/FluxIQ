import { describe, expect, it } from "vitest";
import { generationAnswerLine } from "../generation-answer";

describe("the line for an attempt's answer", () => {
  it.each([
    ["achieved", "I got what you asked for"],
    ["budget_out", "The budget for this ran out"],
    ["stopped_by_person", "Stopped, as you asked"],
    ["waiting_for_person", "This needs you"],
    ["working", "This is still going"]
  ])("says %s as an answer", (status, start) => {
    expect(generationAnswerLine({ ok: true, payload: { answered: { status: "answered", attempt: { status } } } })).toMatch(new RegExp(`^${start}`));
  });

  it("says a setup step in Core's words", () => {
    expect(generationAnswerLine({ ok: true, payload: { setupNeeded: { say: "Add a model key in settings." } } })).toBe("Add a model key in settings.");
  });

  it("leaves a proposal, a candidate and a failure to the panel's other paths", () => {
    expect(generationAnswerLine({ ok: true, payload: { adaptation: { status: "proposed" } } })).toBeUndefined();
    expect(generationAnswerLine({ ok: true, payload: { candidate: {} } })).toBeUndefined();
    expect(generationAnswerLine({ ok: false, payload: { answered: { attempt: { status: "achieved" } } } })).toBeUndefined();
    expect(generationAnswerLine(undefined)).toBeUndefined();
  });
});
