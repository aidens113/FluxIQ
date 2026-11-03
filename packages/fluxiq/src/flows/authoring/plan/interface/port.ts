import type { JsonObject } from "../../../../core/index.ts";

export type AutomationStudioFlowBootstrapInterfacePort = {
  id: string;
  name: string;
  valueType: { kind: "unknown" };
  required?: true;
  metadata?: { binding: JsonObject };
};
