// The id a run of decisions refused for one reason is caught under as a loop (t1014): the warning's own entry
// (`../../decision-handlers/refusal-run.ts`, `core.refusal_run`). Where the caller takes loop detection's signal, three
// such decisions in a row no longer end the round on their count: the run is a finding put on the ladder, steered and
// decided as any repeat is, and only the ladder's last rung ends the round.

/** The id a refusal run is recorded and told under as a loop finding. */
export const AUTOMATION_STUDIO_LLM_LOOP_REFUSED_RUN_TOOL_ID = "core.refusal_run";
