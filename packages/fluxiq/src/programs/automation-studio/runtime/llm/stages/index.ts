// Barrel for the loop's stage protocol: Core's fixed order of work, the
// instructions the model is given at each stage, and the one way a domain
// changes them.
export {
  AUTOMATION_STUDIO_LOOP_STAGES,
  automationStudioLoopStageIndex,
  automationStudioLoopStageTransition,
  isAutomationStudioLoopStage,
  type AutomationStudioLoopStage,
  type AutomationStudioLoopStageRefusalCode,
  type AutomationStudioLoopStageTransition
} from "./protocol.ts";
export {
  AUTOMATION_STUDIO_CORE_LOOP_EVIDENCE_TOOL_POLICY_INSTRUCTION,
  AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTIONS,
  AUTOMATION_STUDIO_CORE_LOOP_STAGE_INSTRUCTION_ID_PREFIX,
  AUTOMATION_STUDIO_LOOP_PROTOCOL_INSTRUCTION_ID,
  AUTOMATION_STUDIO_LOOP_PROTOCOL_SCOPE_KIND,
  AUTOMATION_STUDIO_LOOP_STAGE_SCOPE_KIND,
  automationStudioCoreLoopStageInstructionId,
  automationStudioLoopProtocolInstruction
} from "./instructions.ts";
export {
  AUTOMATION_STUDIO_LOOP_STAGE_INSTRUCTION_LIMIT,
  AutomationStudioLoopStageInstructionRegistry,
  automationStudioLoopStageInstructions,
  type AutomationStudioLoopStageInstructionBundle,
  type AutomationStudioLoopStageInstructionContribution
} from "./registry.ts";
