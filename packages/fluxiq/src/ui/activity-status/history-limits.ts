/**
 * How much of FluxIQ's work the background keeps for the chat's step
 * messages (`background/activity/unit-history.ts`): the last `units` units of
 * work, and at most `eventsPerUnit` events of each, the newest. A build of 60
 * decisions is about 250 kept events, so a whole build fits with room to
 * spare; the bound is there so a runaway loop cannot grow the panel's state
 * without end.
 *
 * A build still in progress is held to `buildEventsCeiling` instead, and is
 * never the unit dropped for a newer one: a build with a project supervisor,
 * several builders, the validator and a repair passes 500 events, and can
 * pass ten units, on its own (automation-project-agents-plan, chat
 * presentation). The ceiling is still a bound, for the same runaway loop.
 */
export const ACTIVITY_HISTORY_LIMITS = { units: 10, eventsPerUnit: 500, buildEventsCeiling: 5_000 } as const;
