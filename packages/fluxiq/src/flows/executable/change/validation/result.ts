import type { ExecutableChangeValidationKind } from "./kind.ts";

export type ExecutableAdaptationValidationResult = {
  runId: string;
  status: "succeeded" | "failed";
  checkedAt: number;
  detail?: string;
  /** Absent on records written before this field existed: read it as `trial`. */
  kind?: ExecutableChangeValidationKind;
  /** The verdict's evidence, as check codes only. Present only on a success. */
  basis?: string[];
};
