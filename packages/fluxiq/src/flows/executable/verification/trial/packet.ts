import type { TrialActOutcome } from "./act-outcome.ts";
import type { TrialLeftAct } from "./left-act.ts";
import type { TrialNotRun } from "./not-run.ts";
import type { TrialPartEffect } from "./part-effect.ts";
import type { TrialProof } from "./proof.ts";
import type { TrialSiteSide } from "./side.ts";
import type { TrialSiteWitnessChange } from "./witness-change.ts";

/** The bounded `siteChange` packet the judge sees (design section 2). No group, scope, place, subject or state token appears in it. */

export type TrialSiteChange = {
  witnesses: Array<{ id: string; kind: "list" | "control"; where?: string; steps: number[]; parts: string[]; before: TrialSiteSide; after: TrialSiteSide; change: TrialSiteWitnessChange }>;
  acts: Array<{ step: number; pass?: { number: number; of: number }; row?: string; outcome: TrialActOutcome["outcome"]; witness?: string; parts: string[] }>;
  leftFromEarlier: TrialLeftAct[];
  proofs: Array<{ part: string; effect: TrialPartEffect; proof: Exclude<TrialProof, "none">; steps: number[]; notRun?: TrialNotRun[] }>;
  omitted?: { witnesses?: number; acts?: number; leftFromEarlier?: number };
};
