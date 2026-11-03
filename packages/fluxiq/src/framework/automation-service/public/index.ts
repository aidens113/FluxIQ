// The framework's public automation entry, `fluxiq/automation`: what a client of the
// automation runtime imports. Automation Studio is one such client, and its own entry,
// `fluxiq/automation-studio`, holds only the controller: endpoints, view state and
// metadata. Node-only; browser code uses this entry's browser-safe subpaths.
export * from "../../../api-contracts/automation.ts";
export { recordAutomationStudioCreatedProjectOwner } from "../../persistence/automation/ownership/index.ts";
export { projectAutomationStudioFailureControlRecord } from "@fluxiq/contracts/automation";
export * from "../actionability/index.ts";
export type { AutomationStudioChangeFeedOperation } from "../../../api-contracts/automation.ts";
export * from "../../../runtime/recording/client-gateway/index.ts";
export * from "../../../flows/authoring/dsl/index.ts";
export * from "../../../runtime/target-matching/fingerprinting/index.ts";
export * from "../learning/index.ts";
export * from "../mining/index.ts";
export * from "../../../flows/authoring/model/index.ts";
export * from "../nodes/index.ts";
export * from "../../../runtime/recording/normalization/index.ts";
export * from "../index.ts";
export * from "../../persistence/automation/index.ts";
export * from "../testing/index.ts";
export * from "../../../api-contracts/automation/document-types/index.ts";
