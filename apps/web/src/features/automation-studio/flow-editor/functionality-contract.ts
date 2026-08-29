import { automationStudioViewId } from "../views/view-registry";
export const flowEditorFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.flowEditor,
  "productPurpose": "Build and edit the selected Flow or Subflow graph with direct manipulation, recovery, validation, and scoped persistence.",
  "owningScope": [
    "project",
    "flow",
    "subflow"
  ],
  "data": {
    "requiredSummary": [
      "Flow or Subflow identity",
      "graph revision",
      "node and edge counts",
      "validation summary"
    ],
    "optionalDetail": [
      "visible graph nodes and edges",
      "node definitions",
      "selected node properties",
      "recovery draft",
      "Problems"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "subflowId or root graph",
      "graph revision",
      "viewport"
    ],
    "invalidationScopes": [
      "Flow graph",
      "Flow draft",
      "node definitions",
      "Problems",
      "runtime readiness"
    ]
  },
  "states": {
    "loading": "Mount the editor shell and stable canvas bounds before graph detail resolves.",
    "empty": "Show a useful first-node action and palette for a valid empty graph.",
    "stale": "Keep the recovery draft and canvas readable, reject stale generation detail, and require conflict-aware save.",
    "error": "Separate graph load, catalog, validation, draft, and save errors while preserving recoverable local operations.",
    "permission": "Allow graph inspection while disabling mutating, publish, deprecate, and run commands not granted."
  },
  "scale": {
    "strategy": "graph-culling-and-scoped-updates",
    "pageSize": 500,
    "mountedItemBudget": 1000,
    "fixtureSize": 10000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Left click selects, left drag moves, right drag creates a selection box, and right click is reserved for contextual actions.",
  "commands": [
    {
      "name": "add, connect, move, multi-select, delete, undo, or redo",
      "pending": "Apply local operations synchronously and persist recovery independently from rendering.",
      "destructive": false
    },
    {
      "name": "save or publish graph",
      "pending": "Keep the canvas interactive where safe, prevent duplicate persistence, and announce conflict or success.",
      "destructive": false
    },
    {
      "name": "delete selected nodes or deprecate Flow",
      "pending": "Retain recoverable operations until the accepted mutation.",
      "destructive": true,
      "confirmation": "Name the selected count or Flow and describe connectivity or lifecycle impact."
    }
  ],
  "accessibility": {
    "keyboard": "Nodes, ports, palette, selection actions, undo/redo, validation, save, and viewport controls are keyboard reachable.",
    "screenReader": "Announce selected node, port compatibility, connection result, validation count, dirty state, and save status."
  },
  "narrowScreen": "Keep the canvas full available size, move secondary tools into responsive drawers, and avoid mode-toggle requirements.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Node parameters use typed controls; graph or run JSON is secondary diagnostic detail and never required for ordinary editing."
  },
  "warmViewRestoration": "Restore viewport, selected nodes, open panel, palette state, local operations, dirty status, and recovery draft for the same graph.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Mount the editor shell and stable canvas bounds before graph detail resolves."
    },
    {
      "state": "empty",
      "contract": "Show a useful first-node action and palette for a valid empty graph."
    },
    {
      "state": "error",
      "contract": "Separate graph load, catalog, validation, draft, and save errors while preserving recoverable local operations."
    },
    {
      "state": "stale",
      "contract": "Keep the recovery draft and canvas readable, reject stale generation detail, and require conflict-aware save."
    },
    {
      "state": "permission",
      "contract": "Allow graph inspection while disabling mutating, publish, deprecate, and run commands not granted."
    },
    {
      "state": "narrow",
      "contract": "Keep the canvas full available size, move secondary tools into responsive drawers, and avoid mode-toggle requirements."
    },
    {
      "state": "warm",
      "contract": "Restore viewport, selected nodes, open panel, palette state, local operations, dirty status, and recovery draft for the same graph."
    }
  ],
  "automatedEvidence": [
    "large-project-behavior.test.ts",
    "commands/commands.test.ts",
    "model/policy-graph.test.ts"
  ],
  "browserOnlyCertification": [
    "Pointer-model certification for select, move, right-drag box, context click, connect, and multi-select.",
    "Long-task, render-count, DOM-node, and retained-heap budget on a 10,000-node graph.",
    "Keyboard graph navigation and narrow responsive-drawer behavior."
  ]
} as const;
