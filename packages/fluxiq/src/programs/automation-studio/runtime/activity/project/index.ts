// Barrel for the project cards: the supervisor's plan, each brief it
// dispatches, each builder's return and each trial receipt, told in the chat
// as `note` rows that carry a `ClientGatewayActivityProjectCard`, built from
// the project-agent contracts and never showing a digest.
export { emitAutomationStudioProjectBriefCard, type AutomationStudioProjectBriefCardInput } from "./brief-card.ts";
export { automationStudioProjectCardWords } from "./card-words.ts";
export { emitAutomationStudioProjectPlanCard, type AutomationStudioProjectPlanCardInput } from "./plan-card.ts";
export { emitAutomationStudioProjectReceiptCard, type AutomationStudioProjectReceiptCardInput } from "./receipt-card.ts";
export { emitAutomationStudioProjectReturnCard, type AutomationStudioProjectReturnCardInput } from "./return-card.ts";
export { automationStudioProjectSubflowName } from "./subflow-name.ts";
export { automationStudioProjectSubflowPurpose } from "./subflow-purpose.ts";
