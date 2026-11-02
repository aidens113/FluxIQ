import type { TrialNotRun } from "./not-run.ts";
import type { TrialPartEffect } from "./part-effect.ts";
import type { TrialProof } from "./proof.ts";

/** One part's proof, with its effect, the trial steps whose acts serve it, and (t796) the part's acting steps not run on some passes. */

export type TrialPartProof = { part: string; effect?: TrialPartEffect; proof: TrialProof; steps: number[]; notRun?: TrialNotRun[] };
