import type { AutomationNodeDefinition } from "../contracts";

export const dataNodes: AutomationNodeDefinition[] = [
  {
    id: "builtin.data.constant",
    label: "Constant",
    description: "Provide a fixed value to the graph.",
    class: "data",
    scope: "both",
    origin: "builtin",
    inputs: [],
    outputs: [{ id: "value", label: "Value", valueType: "any" }],
    parameters: [{ id: "value", label: "Value", valueType: "json", defaultValue: null }],
    icon: "braces"
  },
  {
    id: "builtin.data.get-variable",
    label: "Get Variable",
    description: "Read a named runtime variable.",
    class: "data",
    scope: "both",
    origin: "builtin",
    inputs: [],
    outputs: [{ id: "value", label: "Value", valueType: "any" }],
    parameters: [{ id: "name", label: "Name", valueType: "string", required: true }],
    icon: "database"
  },
  {
    id: "builtin.data.set-variable",
    label: "Set Variable",
    description: "Write a named runtime variable.",
    class: "data",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "value", label: "Value", valueType: "any", required: true }],
    outputs: [{ id: "next", label: "Next", valueType: "any" }],
    parameters: [{ id: "name", label: "Name", valueType: "string", required: true }],
    icon: "save"
  },
  {
    id: "builtin.data.map-object",
    label: "Map Object",
    description: "Transform object fields through an expression map.",
    class: "data",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "object", label: "Object", valueType: "object", required: true }],
    outputs: [{ id: "object", label: "Object", valueType: "object" }],
    parameters: [{ id: "mapping", label: "Mapping", valueType: "json", defaultValue: {} }],
    icon: "file-json"
  },
  {
    id: "builtin.data.filter-list",
    label: "Filter List",
    description: "Filter an array using a boolean expression.",
    class: "data",
    scope: "both",
    origin: "builtin",
    inputs: [{ id: "items", label: "Items", valueType: "array", required: true }],
    outputs: [{ id: "items", label: "Items", valueType: "array" }],
    parameters: [{ id: "predicate", label: "Predicate", valueType: "expression", required: true }],
    icon: "list-filter"
  }
];
