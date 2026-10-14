import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID } from "../../flow-bootstrap/candidate/index.ts";

/**
 * The supervisor's own tools (automation-project-agents-plan.md, `Tool
 * scopes`): reading the task, writing and amending the plan, dispatching
 * briefs, assembling the whole candidate, and testing it -- the last the whole
 * candidate's own trial tool, which no builder is offered.
 */
export const AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS = Object.freeze({
  readTask: "project.read_task",
  writePlan: "project.write_plan",
  amendPlan: "project.amend_plan",
  dispatch: "project.dispatch",
  assemble: "project.assemble",
  testCandidate: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID
} as const);
