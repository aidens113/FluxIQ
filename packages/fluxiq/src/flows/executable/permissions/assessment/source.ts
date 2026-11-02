

/** Trusted call ownership supplied by the gate's host, never declaration JSON. */
export type AutomationStudioActionAssessmentSource = Readonly<{
  kind: "exploration_step" | "flow_step";
  id: string;
  ref: string;
}>;
