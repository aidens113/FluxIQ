export type AutomationFlowConfigExtension = {
  id: string;
  title: string;
  owner: "global" | "node";
  nodeDefinitionId?: string;
  description: string;
  fields: Array<{
    id: string;
    label: string;
    valueType: "string" | "number" | "boolean" | "json";
    description?: string;
    defaultValue?: unknown;
  }>;
};
