import type { AutomationStudioProjectBuilderReturn } from "../index.ts";

/** One brief's return file. Written once. */
export type AutomationStudioProjectBuildReturnRecord = {
  kind: "project_builder_return";
  schemaVersion: 1;
  buildId: string;
  briefId: string;
  recordedAt: number;
  builderReturn: AutomationStudioProjectBuilderReturn;
};
