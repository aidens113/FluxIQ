/**
 * One defect Core located in its own record (P5b), in the shape a judge's
 * located defect has: the kind and row as Core located them, and nothing of the
 * judge's prose. What a later judge is told of an earlier trial
 * (`./earlier-advice.ts`) is made of these alone.
 */

export type ResultStandingNoLocated = {
  kind: "kept_not_asked" | "asked_missing" | "wrong_value" | "act_missing" | "act_wrong" | "other";
  row: string;
  column?: string | undefined;
  value?: string | undefined;
  step?: string | undefined;
};
