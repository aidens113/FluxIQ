import { describe, expect, it } from "vitest";
import { automationStudioCandidateRetestAdvised as advised } from "../index.ts";
import { automationStudioCandidateRetestAdvised as barrelExport } from "../../candidate/index.ts";

const check = (feedback: unknown) => advised({ feedback: feedback as Parameters<typeof advised>[0]["feedback"] });

describe("Core's evidence for advising another candidate test", () => {
  it("keeps the existing candidate barrel bound to the extracted helper", () => {
    expect(barrelExport).toBe(advised);
  });

  it.each([
    [{ unconfirmedReading: { recordContradicts: "whole" } }, true],
    [{ unconfirmedReading: { recordContradicts: "part" } }, false],
    [{ unconfirmedReading: { recordContradicts: "none" } }, false],
    [{ unconfirmedReading: null }, false],
    [{ unconfirmedReading: [] }, false],
    [{ instruction: "The record contradicts the reading wholly." }, false],
    [{ doubtContradicted: "The recorded result resolves the doubt." }, true],
    [{ doubtContradicted: "" }, false],
    [{ doubtContradicted: false }, false]
  ])("uses Core's evidence fields, rather than the feedback's words (%j)", (feedback, expected) => {
    expect(check(feedback)).toBe(expected);
  });

  it("retains the original refusal to treat an unserializable reading as Core's JSON evidence", () => {
    const reading: { recordContradicts: string; self?: unknown } = { recordContradicts: "whole" };
    reading.self = reading;
    expect(check({ unconfirmedReading: reading })).toBe(false);
    expect(check({ unconfirmedReading: reading, doubtContradicted: "The separate doubt was resolved." })).toBe(true);
  });
});
