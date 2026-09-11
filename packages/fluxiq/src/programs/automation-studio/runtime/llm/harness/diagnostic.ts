import type { JsonObject } from "../../../../../core/index.ts";

export type AutomationStudioLlmDiagnostic = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  path?: string;
  metadata?: JsonObject;
};
