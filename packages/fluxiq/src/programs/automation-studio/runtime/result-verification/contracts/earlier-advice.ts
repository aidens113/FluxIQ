// What an earlier judged trial of the same build advised, and whether the
// revision now judged changed what that advice named (t752).
//
// **Why.** A build test's judges saw only the trial in front of them. In a
// breadth rerun, the first whole test was judged no and its judge advised one
// change to a read's condition; the next revision made exactly that change and
// stored exactly the rows asked for, and its judges answered no for the change
// the earlier judge had asked for, beside a claim about another condition the
// request's own words refute. Nothing told them what the build had been told,
// or that it had done it. The gate that keeps a build's trials now hands the
// next judge each earlier judged trial's advice with Core's measure of whether
// the revision changed what it named; a no is then weighed against it
// (`../agreement/`). Core-made: the advice is what the builder was shown, and
// `followed` and `named` are Core's own reading of the two revisions' plans,
// never a model's.

// **Located-only (P5b).** `advice` and `said` are Core's words for the defects it
// located in its record of that trial (`../standing-no/earlier-advice-located.ts`),
// never an earlier judge's prose advice or a claim Core did not locate, to cut
// anchoring. The shape is as before, so its readers are unchanged.

/** One earlier judged trial's located defects, as the judge of a later trial of the same build is told them (header). */
export type AutomationStudioResultEarlierAdvice = {
  /** The revision whose trial gave the advice. */
  revision: number;
  /** That trial's verdict as the gate kept it. */
  verdict: "no" | "unsure";
  /** Core's sentence for the defects it located in that trial's record (P5b), bounded; never a judge's advice. */
  advice: string;
  /**
   * Whether the revision now judged changed the conditions or steps the advice
   * named, by Core's comparison of the two revisions' plans: `changed`,
   * `unchanged`, or `unknown` where Core could not resolve what it named.
   */
  followed: "changed" | "unchanged" | "unknown";
  /** The conditions and steps the advice named, as Core names them, where it resolved them. */
  named?: string[];
  /** Core's sentence for the judge: what was advised after which revision, and what this revision did about it. */
  said: string;
};
