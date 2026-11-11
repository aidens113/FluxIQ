import type { AutomationStudioLlmTaskKind } from "../harness/index.ts";

/** The three roles a run may give a model of its own (`AutomationStudioRunOverrides["models"]`). */
export type AutomationStudioLlmModelRole = "explore" | "judge" | "repair";

/**
 * The role each task kind's call plays, every kind named so a kind added later
 * does not compile until it is given one.
 *
 * - `explore`: working the task out and authoring the Flow -- a build's
 *   decisions and its one-shot draft, the instruction reading, a suggested
 *   instruction or change, and a loop's plan.
 * - `judge`: reading a result against what was asked (`loop_verification`).
 * - `repair`: diagnosing and fixing a Flow that broke -- a run's diagnosis, its
 *   patches of a step, a router, a part or an expectation, and a report on why
 *   it failed.
 */
export const AUTOMATION_STUDIO_LLM_TASK_KIND_ROLES: Readonly<Record<AutomationStudioLlmTaskKind, AutomationStudioLlmModelRole>> = Object.freeze({
  flow_bootstrap: "explore",
  evidence_tool_decision: "explore",
  instruction_suggestion: "explore",
  change_proposal_generation: "explore",
  loop_plan: "explore",
  loop_verification: "judge",
  runtime_diagnosis: "repair",
  runtime_patch: "repair",
  router_patch: "repair",
  subflow_patch: "repair",
  expectation_action_target_patch: "repair",
  diagnosis_only_report: "repair"
});
