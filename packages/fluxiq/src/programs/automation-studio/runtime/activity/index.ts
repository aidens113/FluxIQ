// Barrel for Automation Studio's live activity stream: the hub a build or run
// publishes to, the scope that says which unit of work an emission belongs to,
// the emitters, the evidence-loop observer, and the model's stated reason kept
// beside each decision.
export { automationStudioActivityAskPort, automationStudioActivityAskResolution, emitAutomationStudioActivityAskResolved, emitAutomationStudioActivityClearedWait, emitAutomationStudioActivityWaitedOut, emitAutomationStudioActivityWaitingOnAsk } from "./ask/index.ts";
export { bindAutomationStudioActivityRun } from "./bind.ts";
export { boundedAutomationStudioActivity } from "./bounded.ts";
export { withAutomationStudioBuildActivity } from "./build.ts";
export { automationStudioActivityDecisionReason } from "./decision-reason.ts";
export type { AutomationStudioActivityEmission, AutomationStudioActivityFrame, AutomationStudioActivityInput, AutomationStudioActivityListener, AutomationStudioActivityScope, AutomationStudioActivitySnapshot } from "./contracts.ts";
export { automationStudioActivityHub } from "./default-hub.ts";
export { emitAutomationStudioActivity } from "./emit.ts";
export { AutomationStudioActivityHub } from "./hub.ts";
export { AUTOMATION_STUDIO_ACTIVITY_LIMITS } from "./limits.ts";
export { observeAutomationStudioEvidenceLoop } from "./observer.ts";
export { withAutomationStudioRunActivity } from "./run.ts";
export { runWithAutomationStudioActivity } from "./scope.ts";
export { emitAutomationStudioActivityStep } from "./step.ts";
export { emitAutomationStudioActivityThought } from "./thought.ts";
export {
  automationStudioActivityAction,
  automationStudioActivityCompletionRefusal,
  automationStudioActivityDecision,
  automationStudioActivityHumanLabel,
  automationStudioActivityReasonText,
  automationStudioActivityRecoveryChoice,
  automationStudioActivityToolCall
} from "./wording/index.ts";
