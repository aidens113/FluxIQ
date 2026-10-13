type AutomationInstructionRefusalCode = "automation.instructions_required" | "automation.instruction_led_authoring_required" | "recording.description_required" | "recording.supporting_evidence_invalid";

export class AutomationInstructionError extends Error {
  readonly diagnostic: { code: AutomationInstructionRefusalCode };
  constructor(readonly code: AutomationInstructionRefusalCode) {
    super({ "automation.instructions_required": "Write active instructions in this automation's Instructions before running or building it.", "automation.instruction_led_authoring_required": "Recordings are supporting evidence. Write automation instructions and attach a described recording to build the automation.", "recording.description_required": "Describe what this recording demonstrates before starting it.", "recording.supporting_evidence_invalid": "Supporting recordings must belong to this project, be finished, and have a description." }[code]);
    this.name = "AutomationInstructionError";
    this.diagnostic = { code };
  }
}
