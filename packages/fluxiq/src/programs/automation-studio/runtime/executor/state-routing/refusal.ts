import type { AutomationStudioStateRoutingRecord } from "../contracts.ts";

/**
 * Why state routing passed over a node whose recorded pre-state matched the
 * page, as a closed code (C6, "Safe state routing"):
 *
 * - `unbound_value`: the route goes forward past a step that never ran, whose
 *   value a step on the route's path reads, and nothing in the run has set it
 *   (`./skipped-values.ts`).
 * - `repeats_lasting_act`: the route goes back across a step whose lasting act
 *   already ran in this run, and nothing shows it did not take effect
 *   (`./repeated-act.ts`).
 */
export type AutomationStudioStateRouteRefusalGuard = "unbound_value" | "repeats_lasting_act";

/** One refused way on: where it led, the guard that refused it, and the node that guard named (the skipped producer, or the act it would repeat). */
export type AutomationStudioStateRouteRefusal = { toNodeId: string; guard: AutomationStudioStateRouteRefusalGuard; nodeId: string };

/**
 * The routing record a decision returns: the executor's record, plus every way
 * on a guard refused, in the order they were ranked. Absent when none was. It
 * travels on the attempt's `stateRouting` as it is.
 */
export type AutomationStudioGuardedStateRoutingRecord = AutomationStudioStateRoutingRecord & { refused?: AutomationStudioStateRouteRefusal[] };
