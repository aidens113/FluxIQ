// The bounds on override text.

/** Per-entry limits and the total over every override text of one declaration or run. */
export const FLUXNODE_OVERRIDE_LIMITS = Object.freeze({
  promptAppendMax: 4000,
  promptReplaceMax: 8000,
  toolAppendMax: 1000,
  toolReplaceMax: 2000,
  criterionMax: 500,
  criteriaMax: 20,
  totalTextMax: 32_000
});
