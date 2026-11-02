import type { captureExecutableFlowSnapshot } from "../index.ts";

export function snapshotSource(): Parameters<typeof captureExecutableFlowSnapshot>[0] {
  return {
  "flowId": "flow.snapshot",
  "scope": {
    "kind": "global"
  },
  "interface": {
    "inputs": [
      {
        "id": "item",
        "name": "Item",
        "valueType": {
          "kind": "string"
        },
        "required": true
      }
    ],
    "outputs": []
  },
  "errors": [],
  "nodes": [],
  "edges": []
};
}
