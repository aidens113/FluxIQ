import { expect, it } from "vitest";
import { compileFlowDefinition, compileFlowSource, generateFlowTypeScript } from "../index.ts";
import type { AutomationStudioFlowDefinition } from "../index.ts";

const definition = {
  "flowId": "flow.compatibility",
  "name": "Compatibility",
  "description": "Preserve compilation",
  "metadata": {
    "flowRepresentationVersion": 1,
    "flowRepresentationKind": "subflow_graph",
    "subflowGraph": true,
    "parentFlowId": "flow.parent",
    "parentSubflowId": "subflow.graph"
  },
  "interface": {
    "inputs": [],
    "outputs": []
  },
  "nodes": [
    {
      "id": "z",
      "definitionId": "builtin.data.constant",
      "parameterValues": {
        "value": "ok"
      },
      "position": {
        "x": 10.12345,
        "y": 2
      }
    },
    {
      "id": "a",
      "definitionId": "builtin.control.start"
    }
  ],
  "edges": [
    {
      "id": "a.z",
      "sourceNodeId": "a",
      "targetNodeId": "z"
    }
  ]
} satisfies AutomationStudioFlowDefinition;
const expectedSource = "import { defineFlow } from \"fluxiq/automation-studio/dsl\";\n\nexport default defineFlow({\n  \"flowId\": \"flow.compatibility\",\n  \"name\": \"Compatibility\",\n  \"description\": \"Preserve compilation\",\n  \"scope\": {\n    \"kind\": \"global\"\n  },\n  \"visibility\": \"private\",\n  \"origin\": \"manual\",\n  \"metadata\": {\n    \"flowRepresentationVersion\": 1,\n    \"flowRepresentationKind\": \"subflow_graph\",\n    \"subflowGraph\": true,\n    \"parentFlowId\": \"flow.parent\",\n    \"parentSubflowId\": \"subflow.graph\"\n  },\n  \"interface\": {\n    \"inputs\": [],\n    \"outputs\": []\n  },\n  \"errors\": [],\n  \"variables\": [],\n  \"nodes\": [\n    {\n      \"id\": \"a\",\n      \"definitionId\": \"builtin.control.start\"\n    },\n    {\n      \"id\": \"z\",\n      \"definitionId\": \"builtin.data.constant\",\n      \"parameterValues\": {\n        \"value\": \"ok\"\n      },\n      \"position\": {\n        \"x\": 10.123,\n        \"y\": 2\n      }\n    }\n  ],\n  \"edges\": [\n    {\n      \"id\": \"a.z\",\n      \"sourceNodeId\": \"a\",\n      \"targetNodeId\": \"z\"\n    }\n  ],\n  \"dependencies\": []\n});\n";

it("preserves the exact persisted Studio visual/code digest and generated source", () => {
  const visual = compileFlowDefinition(definition, { projectId: "project.fixture", now: 17 });
  expect(visual.ok).toBe(true);
  if (!visual.ok) return;
  expect(visual.plan.digest).toBe("sha256:75839c8116bafbcdc067fe1b94598201ee243f87c9b934a2b4c2ce260af7fa73");
  expect(generateFlowTypeScript(visual.plan.flow)).toBe(expectedSource);
  const code = compileFlowSource(expectedSource, { projectId: "project.fixture", moduleId: "flows/compatibility.flow.ts", now: 33 });
  expect(code).toMatchObject({ ok: true, plan: { digest: "sha256:77cc0aa74b92fbc1d2f53a55cb62ac2cf97935351934b52c6c5842faee640500" } });
});
