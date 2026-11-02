import type { CompileAutomationStudioPlanInput } from "../index.ts";

/** Stable input captured before moving the compiler. */
export function planInput(): CompileAutomationStudioPlanInput {
  return {
  "projectId": "project.plan",
  "flowId": "flow.plan",
  "flowRevision": 1.9,
  "graphRevision": 2,
  "settingsRevision": 3,
  "compiledAt": 1000,
  "nodes": [
    {
      "id": "z.start",
      "definitionId": "builtin.control.start",
      "definitionVersion": "1.0.0",
      "label": "z.start",
      "parameterValues": {},
      "metadata": {}
    },
    {
      "id": "a.end",
      "definitionId": "builtin.control.end",
      "definitionVersion": "1.0.0",
      "label": "a.end",
      "parameterValues": {},
      "metadata": {}
    }
  ],
  "edges": [
    {
      "id": "edge",
      "sourceNodeId": "z.start",
      "targetNodeId": "a.end",
      "sourcePortId": "",
      "targetPortId": null,
      "label": "",
      "metadata": {}
    }
  ],
  "resolvedSettings": {
    "z": 1,
    "a": {
      "b": true
    }
  },
  "resolvedInstructions": [
    {
      "instructionId": "i.z",
      "title": "Z",
      "body": "Read the inventory.",
      "scopeKind": "flow",
      "requirement": "required",
      "priority": 2,
      "revision": 2,
      "contentDigest": "digest.z"
    },
    {
      "instructionId": "i.a",
      "title": "A",
      "body": "Keep values typed.",
      "scopeKind": "flow",
      "requirement": "required",
      "priority": 1,
      "revision": 1,
      "contentDigest": "digest.a"
    }
  ],
  "dependencies": [
    {
      "kind": "flow",
      "id": "z"
    },
    {
      "kind": "flow",
      "id": "a",
      "revision": 2
    }
  ]
};
}
