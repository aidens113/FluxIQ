/**
 * The most a host may ask for. The three that bound the loop are Core's own
 * loop ceilings, not a preference of this file's.
 *
 * They are written out rather than read from `AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS`
 * because `llm/harness/intervention.ts` imports a *value* from this directory,
 * so reading one back at module-evaluation time closes a cycle and leaves this
 * constant holding `undefined` -- observed, not theorised. A test pins the three
 * equal to the loop's own limits, so they cannot drift apart silently.
 */
export const AUTOMATION_STUDIO_EXPLORATION_BUDGET_CEILINGS = Object.freeze({
  maxDurationMs: 600_000,
  maxActions: 64,
  maxProviderCalls: 64,
  maxRefusedActions: 8,
  maxRepeatsPerAction: 4,
  maxStepsWithoutProgress: 8
});
