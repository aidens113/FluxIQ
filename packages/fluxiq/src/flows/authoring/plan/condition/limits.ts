export const AUTOMATION_STUDIO_ROUTE_CONDITION_LIMITS = {
  /** Conditions one group may hold. */
  maxGroupSize: 8,
  /** Groups inside groups, counting the outermost. */
  maxDepth: 3,
  /** Characters an expected text may hold. */
  maxExpectedLength: 500
} as const;
