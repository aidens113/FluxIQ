import type { AutomationStudioChangeProposalKind } from "../../../model/index.ts";

/**
 * What each kind of adaptation patch does to a Flow, and therefore which gates
 * it must pass before it reaches one.
 *
 * Three separate predicates used to hand-list the kinds they applied to: the
 * change-proposal requirement, the "major patch" test that forces proposal mode,
 * and the "structural patch" test that requires manual review before durable
 * promotion. Three lists, maintained by hand, of a union that grows. A kind
 * added later therefore defaulted to passing all three -- and ungated is the
 * wrong default for lists whose job is deciding whether a change reaches a
 * user's Flow without anyone reviewing it.
 *
 * That is not hypothetical. `insert_deterministic_path` reached exactly that
 * state: it inserts EXECUTABLE action nodes into the graph, and it was gated
 * less than the `edit_recovery` it replaced -- which was inert, because nothing
 * in Core ever read what that one wrote. An adaptation applied with no
 * `proposalId` succeeded.
 *
 * So the classification is declared once, in a record keyed by the kind union
 * itself. A kind added later fails to compile until it says what it does, which
 * is the same shape the PIN reclassification (L16) takes for endpoints and for
 * the same reason: a gate nobody can forget to join.
 */
export type AutomationStudioAdaptationPatchGates = {
  /** Cannot be applied durably without a linked, reviewed change proposal. */
  requiresProposal: boolean;
  /** Forces proposal mode rather than automatic application under `mixed`. */
  major: boolean;
  /** Requires manual review before durable promotion. */
  structural: boolean;
};

const GATED: AutomationStudioAdaptationPatchGates = { requiresProposal: true, major: true, structural: true };
const OPEN: AutomationStudioAdaptationPatchGates = { requiresProposal: false, major: false, structural: false };

export const AUTOMATION_STUDIO_ADAPTATION_PATCH_GATES: Record<AutomationStudioChangeProposalKind, AutomationStudioAdaptationPatchGates> = {
  create_subflow: GATED,
  edit_subflow: { requiresProposal: true, major: false, structural: true },
  edit_router: GATED,
  edit_recovery: GATED,
  // Inserts whole executable action nodes and wires them into the graph, so it
  // is at least as consequential as any kind above it. It was gated by none of
  // the three until 2026-09-17.
  insert_deterministic_path: GATED,
  // Not proposal-gated: promotion acts on an adaptation that already carries
  // its own review, so requiring a second proposal would gate the review itself.
  promote_adaptation: { requiresProposal: false, major: true, structural: true },
  edit_expectation: OPEN,
  edit_action_target: OPEN,
  edit_instruction: OPEN
};
