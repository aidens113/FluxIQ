import type { AutomationStudioInputHead, AutomationStudioInputScope } from "../../../../runtime/input-basis/index.ts";

export type AutomationStudioInputBasisDocument = {
  kind: "normal_input_basis_owner"; schemaVersion: 1; projectId: string; ownerId: string;
  bindings: { scope: AutomationStudioInputScope; head: AutomationStudioInputHead }[];
};
