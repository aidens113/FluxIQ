import { describe, expect, it } from "vitest";
import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { automationStudioFlowLessSummaryDigest } from "../summary-digest.ts";
import type { AutomationStudioFlowLessSummary } from "../types.ts";

const ACT: AutomationStudioAttemptAct = { id: "act.1", what: "Booked the hall", where: "the bookings page", classes: ["create_new"], state: "landed" };
const base = (): AutomationStudioFlowLessSummary => ({
  instructions: "Book the hall.",
  rows: { totalRows: 1, truncated: false, columns: [{ id: "date", label: "Date" }], rows: [{ date: "13 May" }] },
  acts: [ACT],
  answerText: "Booked.",
  endView: { after: "end", view: { lines: ["Bookings: 3"], count: 3 } },
  witnesses: { before: { bookings: 2, open: true }, after: { bookings: 3, open: true } }
});

describe("the Flow-less summary's digest", () => {
  it("is a sha256 digest, the same for the same evidence", () => {
    expect(automationStudioFlowLessSummaryDigest(base())).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(automationStudioFlowLessSummaryDigest(base())).toBe(automationStudioFlowLessSummaryDigest(base()));
  });

  it("is stable across key order, at every depth", () => {
    const reordered: AutomationStudioFlowLessSummary = {
      witnesses: { after: { open: true, bookings: 3 }, before: { open: true, bookings: 2 } },
      endView: { view: { count: 3, lines: ["Bookings: 3"] }, after: "end" },
      answerText: "Booked.",
      acts: [{ state: "landed", classes: ["create_new"], where: "the bookings page", what: "Booked the hall", id: "act.1" }],
      rows: { rows: [{ date: "13 May" }], columns: [{ label: "Date", id: "date" }], truncated: false, totalRows: 1 },
      instructions: "Book the hall."
    };
    expect(automationStudioFlowLessSummaryDigest(reordered)).toBe(automationStudioFlowLessSummaryDigest(base()));
  });

  it("treats an absent field and an undefined one alike", () => {
    const { answerText: _answerText, ...without } = base();
    const withUndefined = { ...base(), answerText: undefined } as unknown as AutomationStudioFlowLessSummary;
    expect(automationStudioFlowLessSummaryDigest(withUndefined)).toBe(automationStudioFlowLessSummaryDigest(without));
  });

  it("does not move on a handle a read minted afresh on the same row", () => {
    const again = base();
    again.rows = { ...again.rows!, rows: [{ date: "13 May", $handle: "h9" }] };
    expect(automationStudioFlowLessSummaryDigest(again)).toBe(automationStudioFlowLessSummaryDigest(base()));
  });

  it.each<[string, (summary: AutomationStudioFlowLessSummary) => AutomationStudioFlowLessSummary]>([
    ["a new row", (summary) => ({ ...summary, rows: { ...summary.rows!, totalRows: 2, rows: [...summary.rows!.rows, { date: "20 May" }] } })],
    ["a changed cell", (summary) => ({ ...summary, rows: { ...summary.rows!, rows: [{ date: "20 May" }] } })],
    ["a new act", (summary) => ({ ...summary, acts: [...summary.acts, { ...ACT, id: "act.2" }] })],
    ["an act's state", (summary) => ({ ...summary, acts: [{ ...ACT, state: "undone" }] })],
    ["the model's answer", (summary) => ({ ...summary, answerText: "Booked for 13 May." })],
    ["the end view", (summary) => ({ ...summary, endView: { view: { count: 4 } } })],
    ["a witness", (summary) => ({ ...summary, witnesses: { before: { bookings: 2, open: true }, after: { bookings: 4, open: true } } })],
    ["the request", (summary) => ({ ...summary, instructions: "Book the hall twice." })]
  ])("moves on %s", (_name, change) => {
    expect(automationStudioFlowLessSummaryDigest(change(base()))).not.toBe(automationStudioFlowLessSummaryDigest(base()));
  });
});
