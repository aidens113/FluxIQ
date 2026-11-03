import type { AutomationNodeParameter, AutomationNodeValueType } from "../../../../components/automation/index.ts";
import type { JsonValue } from "../../../../core/index.ts";

export type AutomationStudioFlowBootstrapCatalogEntry = {
  id: string;
  version: string;
  label: string;
  description: string;
  category: string;
  capabilities: string[];
  inputs: Array<{ id: string; type: AutomationNodeValueType; required?: true; multiple?: true }>;
  outputs: Array<{ id: string; type: AutomationNodeValueType; multiple?: true }>;
  parameters: Array<{
    id: string;
    type: AutomationNodeParameter["valueType"];
    required?: true;
    stateBindable?: false;
    defaultValue?: JsonValue;
    options?: string[];
    constraints?: AutomationNodeParameter["constraints"];
    /** For an object, json or array parameter: what its value holds, bounded. */
    description?: string;
    /** For an object, json or array parameter: a value of the right shape, sent only when it is small. */
    example?: JsonValue;
  }>;
  outputAction?: { required: true; fixed?: string; allowed?: string[] };
};
