// Each pass of a repeat ran the step carrying the part's requested act
// (`../act-passes.ts`, framework plan P5): a part with a typed effect and any
// step the trial's change says did not run (`notRun`, t796's shape, read
// structurally), or its proof `not_run`, is a computed fail naming the step, the passes and why; absent,
// no fact. On the made-up library holds trial of
// `../../site-change/tests/library-holds-fixture.ts`.
import { describe, expect, it } from "vitest";
import type { AutomationStudioTrialSiteChange } from "../../../flow-bootstrap/trial-change/index.ts";
import { LIBRARY_HOLDS_REQUEST, libraryHoldsChange, libraryHoldsSummary } from "../../site-change/tests/library-holds-fixture.ts";
import { automationStudioResultActPassesFact } from "../index.ts";

/** p1's proof with `notRun` (and, where given, its proof word) as the producer would carry them; the type does not hold them yet. */
function withNotRun(notRun: unknown, proof?: string): AutomationStudioTrialSiteChange {
  const base = libraryHoldsChange("carried");
  return { ...base, proofs: [{ ...base.proofs[0]!, ...(proof ? { proof } : {}), notRun } as unknown as AutomationStudioTrialSiteChange["proofs"][number], base.proofs[1]!] };
}

const facts = (siteChange: AutomationStudioTrialSiteChange) =>
  automationStudioResultActPassesFact({ summary: libraryHoldsSummary(siteChange), instructions: [{ title: "Holds", body: LIBRARY_HOLDS_REQUEST }], requestText: `Holds\n${LIBRARY_HOLDS_REQUEST}` });

describe("each pass ran the step carrying the part's act", () => {
  it("computes no fact where no proof carries notRun: today's summaries, judged as before", () => {
    expect(facts(libraryHoldsChange("carried"))).toEqual([]);
  });

  it("fails a typed part with a step that did not run, as act_missing naming the step, the passes and why", () => {
    const [fact, ...rest] = facts(withNotRun([{ nodeId: "node.hold", label: "Place hold", passes: [2, 3], of: 3, reason: "guarded", after: "Open the book" }]));
    expect(rest).toEqual([]);
    expect(fact).toMatchObject({ kind: "act_passes", status: "fails" });
    expect(fact!.said).toContain('part "p1" (adds 1 hold on a book) was not done on every pass of this trial');
    expect(fact!.said).toContain('the step "Place hold" did not run on passes 2 and 3 of 3: a guard routed past it, as it runs only after "Open the book"');
    expect(fact!.defects).toEqual([{
      kind: "act_missing",
      row: 'the step "Place hold" did not run on passes 2 and 3 of 3: a guard routed past it, as it runs only after "Open the book"',
      step: "Place hold",
      requestWords: `Holds\n${LIBRARY_HOLDS_REQUEST}`
    }]);
  });

  it("says a step the run never reached, on every pass", () => {
    const [fact] = facts(withNotRun([{ nodeId: "node.hold", passes: "every", reason: "unreached" }], "not_run"));
    expect(fact!.defects?.[0]?.row).toBe("the step node.hold did not run on any pass: the run ended or failed before reaching it");
  });

  it("holds where notRun is present and empty, and reads nothing of an entry not of the proposed shape", () => {
    expect(facts(withNotRun([]))).toEqual([{ kind: "act_passes", status: "holds", said: 'Core read that every step serving part "p1" (adds 1 hold on a book) ran on every pass of this trial.' }]);
    expect(facts(withNotRun([{ step: 3, passes: [2], why: "guarded" }]))).toEqual([]);
    expect(facts(withNotRun("every"))).toEqual([]);
  });

  it("fails a `not_run` proof that carries no list, naming the part", () => {
    const [fact] = facts(withNotRun(undefined, "not_run"));
    expect(fact).toMatchObject({ kind: "act_passes", status: "fails", defects: [{ kind: "act_missing", row: 'part "p1"' }] });
    expect(fact!.said).toContain('no step serving part "p1"');
  });
});
