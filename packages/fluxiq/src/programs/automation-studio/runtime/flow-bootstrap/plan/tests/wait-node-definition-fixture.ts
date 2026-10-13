import type { AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";

// A generic wait step, with no browser vocabulary: it waits for an element,
// named by handle in `target`, to reach a condition written inside `wait`, and
// may say what the page shows afterwards in `expectedState`. It is the shape of
// the step that ended social gate run `run-mv6v2jh4-69244ffb` (t514): the model
// wrote `state: absent`, the near-name fallback took `state` for
// `expectedState`, and the bare word became a handle no view had printed.
//
// Only `target` declares that it takes a handle (its example is one). The
// condition words are declared where a node may declare the vocabulary of its
// structured parameters: the JSON Schema of its parameters, under
// `metadata.parameterSchema`.
//
// Resolve it with scope `{ kind: "domain", domainId: "demo" }` and no runtime
// capabilities or permissions.

export const WAIT_NODE_DEFINITION_ID = "domain.demo.wait";

export function waitNodeDefinitionFixture(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: WAIT_NODE_DEFINITION_ID,
    version: "1.0.0",
    label: "Wait for an element",
    description: "Waits until an element reaches a condition.",
    category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "demo.wait" },
    availability: { kind: "domain", domainId: "demo" },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: "demo.wait" },
    inputs: [],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [
      { id: "target", label: "Target", description: "The element, by the handle the view printed: {\"handle\": \"t5\"}.", valueType: "object", example: { handle: "t5" }, ui: { control: "value" } },
      { id: "selector", label: "Selector", valueType: "string", shownToModel: false },
      { id: "timeoutMs", label: "Timeout", valueType: "number", defaultValue: 10_000 },
      { id: "wait", label: "Condition", valueType: "object", ui: { control: "value" } },
      { id: "expectedState", label: "Expected State", description: "What the page shows once this step worked.", valueType: "object", ui: { control: "value" } }
    ],
    metadata: {
      parameterSchema: {
        type: "object",
        properties: {
          wait: {
            type: "object",
            properties: {
              condition: { type: "string", enum: ["present", "visible", "enabled", "absent"] },
              stableForMs: { type: "integer" }
            }
          }
        }
      }
    }
  };
}
