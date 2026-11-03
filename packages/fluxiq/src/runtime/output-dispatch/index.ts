export type { RegisteredOutputAction } from "./action.ts";
export type { PreparedOutputAction } from "./prepared-action.ts";
export type { OutputTargetPreparation } from "./target-preparation.ts";
export type { OutputTargetPreparer } from "./target-preparer.ts";
export type { OutputTargetSelection, OutputTargetMatchResult } from "./matching/index.ts";
export { matchOutputTarget, outputTargetMinimumConfidence } from "./matching/index.ts";
export { prepareOutputAction } from "./prepare-action.ts";
export { compactJsonObject } from "./compact.ts";
export { outputDispatchFailure } from "./failure.ts";
