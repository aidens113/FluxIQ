/** A witness as a plan node carries it: `via`, and a Core receipt ref or act id, never a domain identity. Projects require a control receipt; bare forms are standalone compatibility only. */
export type AutomationStudioSiteResetWitnessStamp =
  | { via: "destination"; ref: string }
  | { via: "own_list" }
  | { via: "control"; ref?: string }
  | { via: "repeats"; act: string }
  | { via: "legacy" };
