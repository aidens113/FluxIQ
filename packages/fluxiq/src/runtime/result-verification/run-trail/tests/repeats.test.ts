// t978: a page view the judge was already shown is shown once, as a reference to the first entry that holds it. The
// fixture is a library's catalogue, a kind of site no realistic scenario uses.

import { describe, expect, it } from "vitest";
import { automationStudioAnthropicJudgeContinuation } from "../../../models/providers/anthropic/index.ts";
import { AUTOMATION_STUDIO_RESULT_TRAIL_NOTE } from "../note.ts";
import { automationStudioResultRunTrail } from "../trail.ts";

const view = (title: string) => `PAGE "${title}"\n${"t1 \"Moby-Dick\" \"On shelf\"\n".repeat(8)}`;
const fields = (title: string) => ({ page: view(title), view: `VIEW ${title} ${"x".repeat(150)}`, truncated: false });
const build = (steps: Parameters<typeof automationStudioResultRunTrail>[0]) => automationStudioResultRunTrail(steps, [])!.trail!;
const size = (value: unknown) => JSON.stringify(value).length;

describe("a trail shows each page view once", () => {
  it("makes a repeat a stub pointing at the first holder, and never stubs the first holder", () => {
    const trail = build([
      { callId: "c1", did: "web.inspect", found: fields("Catalogue") },
      { callId: "c2", did: "web.inspect", found: fields("Catalogue") },
      { callId: "c3", did: "web.inspect", found: fields("Catalogue") }
    ]);
    expect(trail.entries[0]!.found).toEqual(fields("Catalogue"));
    expect(trail.entries[1]!.found).toEqual({ page: { sameAs: "c1" }, view: { sameAs: "c1" }, truncated: false });
    expect(trail.entries[2]!.found).toEqual({ page: { sameAs: "c1" }, view: { sameAs: "c1" }, truncated: false });
  });

  it("leaves distinct views untouched, and names an entry with no callId by its number", () => {
    const trail = build([
      { did: "web.inspect", found: fields("Catalogue") },
      { callId: "c2", did: "web.inspect", found: fields("Loans") },
      { callId: "c3", did: "web.inspect", found: { ...fields("Loans"), page: view("Catalogue") } }
    ]);
    expect(trail.entries[1]!.found).toEqual(fields("Loans"));
    expect(trail.entries[2]!.found).toEqual({ ...fields("Loans"), page: { sameAs: "n:1" }, view: { sameAs: "c2" } });
  });

  it("changes nothing but the note where no member repeats, in order and member for member", () => {
    const steps = [
      { callId: "c1", did: "web.inspect", asked: { q: 1 }, outcome: "ok", where: "/a", found: fields("A") },
      { callId: "c2", did: "web.read", found: fields("B") }
    ];
    const trail = build(steps);
    expect(trail.note).toBe(AUTOMATION_STUDIO_RESULT_TRAIL_NOTE);
    expect(trail.note).toContain("sameAs");
    expect(JSON.stringify(trail.entries)).toBe(JSON.stringify(steps.map((step, at) => ({ n: at + 1, ...step }))));
  });

  it("is much smaller for a run that read the same page again and again", () => {
    const steps = Array.from({ length: 12 }, (_, at) => ({ callId: `c${at}`, did: "web.inspect", found: fields(at === 0 ? "Start" : "Catalogue") }));
    const distinct = Array.from({ length: 12 }, (_, at) => ({ callId: `c${at}`, did: "web.inspect", found: fields(`Page ${at}`) }));
    const repeated = size(build(steps).entries);
    const whole = size(build(distinct).entries);
    expect(repeated).toBeLessThan(whole * 0.5);
  });

  // The decider's evidence holds a compact current view, not the trail's page views (run-mwoxglkg-e37fd49b: none of 31), so
  // a reference to an entry the continuation leaves out would point at nothing: that entry's value comes back whole instead.
  it("gives an entry whose referenced holder the continuation drops that holder's value whole", () => {
    const trail = build([
      { callId: "held", did: "web.inspect", found: fields("Catalogue") },
      { callId: "later", did: "web.inspect", found: fields("Catalogue") }
    ]);
    const judgeUser = JSON.stringify({ context: { resultSummary: { trail } } });
    const sent = automationStudioAnthropicJudgeContinuation({ wire: { model: "m", messages: undefined }, blocks: [{ type: "text", text: "head" }], callIds: ["held"] }, "judge", judgeUser);
    const message = (sent.messages as { content: { text: string }[] }[])[0]!;
    const payload = JSON.parse(message.content.at(-1)!.text) as { context: { resultSummary: { trail: { note: string; shownAbove: string; entries: { callId: string; found: { page: unknown } }[] } } } };
    const shown = payload.context.resultSummary.trail;
    expect(shown.entries.map((entry) => entry.callId)).toEqual(["later"]);
    expect(shown.entries[0]!.found).toEqual(fields("Catalogue"));
    expect(shown.shownAbove).toContain("in its evidence above, each by the callId");
    expect(shown.note).toContain("the value is exactly the one in that entry.");
  });
});
