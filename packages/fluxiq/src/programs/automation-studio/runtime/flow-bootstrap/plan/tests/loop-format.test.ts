import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA,
  AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE,
  AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT,
  AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT
} from "../index.ts";

describe("the Flow script loop grammar", () => {
  it("stays out of the format, so the legacy completion schema does not change", () => {
    for (const words of ["repeat over", "repeat while", "$row."]) {
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT).not.toContain(words);
      expect(AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE).not.toContain(words);
      expect(JSON.stringify(AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA)).not.toContain(words);
    }
  });

  it("says the rows a repeat acts on are narrowed on the listing, and where repeat most goes", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT;
    expect(text).toContain("The rows a `repeat over` acts on are the rows its listing kept. To act on only some, put the condition on the listing step: `extractList.where:");
    expect(text).toContain("It never changes which rows a repeat visits.");
    expect(text).toContain("`repeat most:` goes beside `repeat while:`, on the span's first step, never under its last: `repeat while: next` then `repeat most: 20`.");
    expect(text).toContain("A span whose last step answers ended -- a next-page step -- needs none.");
  });

  it("says repeat most beside repeat over acts on only the listing's first rows, with an example of another kind of site", () => {
    const clause = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT.split("\n").find((line) => line.includes("Beside `repeat over:`"));
    expect(clause).toContain("Beside `repeat over:` it acts on only the listing's first rows, in their order, and then the Flow goes on: `repeat over: bookmarks` then `repeat most: 2` does the span for the first two bookmarks.");
    expect(clause).not.toMatch(/photo|\blike|\bpost|newest/i);
  });

  it("names the listing's own order, extractList.sort, and that a repeat over visits it, with an example of another kind of site", () => {
    const sentence = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT.split("\n").find((line) => line.includes("`extractList.sort:"));
    expect(sentence).toBeDefined();
    expect(sentence).toContain("A `repeat over` visits its listing's rows in the listing's own order, so `repeat most: N` acts on the first N of that order.");
    expect(sentence).toContain("`extractList.sort: [{\"field\": \"due\", \"order\": \"asc\", \"as\": \"date\"}]`");
    expect(sentence).toContain("`order` is asc or desc and `as` is number, date or text");
    expect(sentence).toContain("to pay the two oldest unpaid invoices");
    expect(sentence).toContain("A sort or limit in `recordOutput.process` orders only the saved answer, never the rows a repeat visits.");
    expect(sentence).not.toMatch(/shop|store|cart|basket|feed|social|post|photo|\blike|heart|saved item|job|address|newest|friend|request/iu);
  });

  it("says Core orders a repeat's rows by the listing's sort, unreadable rows last, before repeat most", () => {
    const sentence = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT.split("\n").find((line) => line.includes("`extractList.sort:"))!;
    expect(sentence).toContain("Core hands the repeat its rows in that order, rows the sort cannot read last, before `repeat most` takes the first of them, whatever order the page shows them in.");
    expect(sentence).toContain("never stand for an order with a where that copies a value out of an answer");
    expect(sentence).toContain("To save only the rows the repeat acts on, give the listing a limit of the same N.");
    expect(sentence).not.toContain("nothing reorders them");
  });

  it("teaches how a loop adapts when a trial says the site asked it to slow down", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT;
    expect(text).toContain("An `optional: yes` step may stand inside a span");
    expect(text).toContain("with `only after: <its label>` runs only on the passes where that step was done");
    expect(text).toContain("`repeat pace: <time>` goes beside `repeat over:` or `repeat while:`, on the span's first step");
    expect(text).toContain("adapt the Flow rather than send it again: `repeat pace:` of at least that wait on the span's first step.");
    expect(text).toContain("a `builtin.timing.wait` step with `only after: <that step's label>` that waits at least the wait the feedback named.");
  });

  it("asks for a step closing the notice only against the way out the trial named, and for the pace alone otherwise", () => {
    const text = AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT;
    expect(text).toContain("When that step's feedback also lists the notice under `interruptions` with the handle of its way out, `wayOut`, add right after the step, inside the span, an `optional: yes` step that presses that handle");
    expect(text).toContain("A notice listed with no `wayOut` was closed by the run itself: write no step for it, and never close it through any other handle.");
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT).toContain("one with a `wayOut` is dismissed through that handle and no other; one with none was closed by the run itself and needs no step.");
  });
});
