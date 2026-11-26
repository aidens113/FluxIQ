// A leaf beside the run cost ceiling, so a Flow's settings (t583) and a run's budget read one figure without a module
// cycle.

/**
 * The largest call count a Flow's settings may name, and the count a run's budget was once held to when nobody named
 * one.
 *
 * **No run is held to it (t1056).** It was the runaway backstop of the run budget's ledger (`../run-budget.ts`), and it
 * ended recoveries whose calls were cheap before their money did (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY
 * FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). A run ends with its dollar ceiling, its token ceilings, its
 * clock, or a provider failure that is not transient. It stays only as the bound on what a Flow's call-count setting may
 * say (`../../../framework/automation-service/service/flow-settings-requests/llm-execution-settings.ts`) and for
 * `adaptation/recovery/annotation/run-budget.ts`, which still hands the ledger a declared count it reads no more.
 */
export const AUTOMATION_STUDIO_LLM_RUN_CALL_BACKSTOP = 250;
