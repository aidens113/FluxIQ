// How large a Flow may be: one setting, the most nodes one Subflow may hold.
//
// **One number, because a Flow was being capped in ten places.** A reply was
// held to sixteen nodes, a drafted Flow to sixty-four, a straight chain to a
// depth of sixteen, and a deterministic recovery path to sixteen again, and
// nobody who owned the Flow could change any of them. Every bound on a Flow's
// size now reads this one setting, and the bounds that follow from it --
// edges, graph depth, plan and result bytes -- are derived from it
// (`runtime/flow-bootstrap/plan/size-limits.ts`), so raising it raises all of
// them together.
//
// It is a Flow setting, stored in the Flow's metadata beside its training and
// execution settings and saved through the same `update-flow-settings` patch,
// because Core has no per-project settings store and the Flow is what a build
// writes. A Flow saved before the setting existed has no value and reads the
// default; nothing is migrated.
/** The setting's identity, default and range, as every reader and the web panel name it. */
export const AUTOMATION_STUDIO_FLOW_SIZE_SETTING = {
  /** The Flow metadata key the settings object lives under. */
  metadataKey: "flowSizeSettings",
  /** The field inside it. */
  field: "maxNodesPerSubflow",
  /** How a refusal names it. */
  path: "flowSizeSettings.maxNodesPerSubflow",
  /** Where a person changes it. */
  label: "Flow Settings > Maximum nodes per Subflow",
  defaultValue: 100,
  minimum: 1,
  /**
   * A range, not a cap on Flows: it keeps a mistyped value from deriving plan
   * and result byte budgets no reader can hold. A person who needs more than a
   * thousand nodes in one Subflow is better served by a second Subflow.
   */
  maximum: 1_000
} as const;
