

/**
 * Core's reading of the two answers together.
 *
 * `not_comparable` is the honest ending when no action was ever put to the
 * gate: a build that only read a page declared nothing because it did nothing,
 * and calling that a contradiction would make every extraction Flow suspect.
 */
export type AutomationStudioActionDeclarationCrossCheckVerdict = "agreed" | "undeclared" | "beyond_instruction" | "not_comparable";
