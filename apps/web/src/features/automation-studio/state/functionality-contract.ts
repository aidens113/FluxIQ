import { automationStudioViewId } from "../views/view-registry";
export const stateFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.state,
  "productPurpose": "Inspect observed and runtime State evidence in visual, structured, diff, compare, evidence, and raw modes.",
  "owningScope": [
    "project",
    "flow",
    "recording",
    "selection"
  ],
  "data": {
    "requiredSummary": [
      "bounded state source index",
      "selected source identity",
      "available modes"
    ],
    "optionalDetail": [
      "selected snapshot",
      "facts",
      "evidence bindings",
      "visual overlays",
      "comparison inputs"
    ],
    "cacheKeyParts": [
      "projectId",
      "selection identity",
      "source index revision",
      "snapshotId",
      "mode",
      "structured page"
    ],
    "invalidationScopes": [
      "state source index",
      "selected snapshot",
      "recording timeline",
      "runtime action"
    ]
  },
  "states": {
    "loading": "Publish the selected State intent immediately and load only the exact indexed snapshot required by the active mode.",
    "empty": "Keep mode controls visible and explain unavailable evidence without silently switching modes.",
    "stale": "Preserve the current snapshot with source provenance and reject stale project-generation detail.",
    "error": "Show exact missing or failed source and retry the same indexed state request.",
    "permission": "Keep permitted summaries visible and withhold protected snapshot detail or commands explicitly."
  },
  "scale": {
    "strategy": "bounded-index-lazy-detail-and-virtualized-facts",
    "pageSize": 100,
    "mountedItemBudget": 200,
    "fixtureSize": 100000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Global Flow, Recording, Run, node, and timeline selections resolve through one bounded source index; local fact selection stays local.",
  "commands": [
    {
      "name": "open exact State source",
      "pending": "Publish selection and loading synchronously, then accept only current-generation detail.",
      "destructive": false
    },
    {
      "name": "retry State detail",
      "pending": "Retry the same source identity without changing the active mode.",
      "destructive": false
    }
  ],
  "accessibility": {
    "keyboard": "Mode tabs, source controls, fact rows, visual targets, evidence links, and paging are keyboard reachable.",
    "screenReader": "Announce source provenance, mode, loading, unavailable evidence, selected fact, and comparison mismatch counts."
  },
  "narrowScreen": "Stack controls and evidence panels, preserve the selected mode, and keep visual/structured surfaces within the viewport.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Raw State JSON is an explicit mode or disclosure and is never the initial presentation."
  },
  "warmViewRestoration": "Restore source identity, mode, selected fact or visual target, structured page, compare target, and viewport for the same project.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Publish the selected State intent immediately and load only the exact indexed snapshot required by the active mode."
    },
    {
      "state": "empty",
      "contract": "Keep mode controls visible and explain unavailable evidence without silently switching modes."
    },
    {
      "state": "error",
      "contract": "Show exact missing or failed source and retry the same indexed state request."
    },
    {
      "state": "stale",
      "contract": "Preserve the current snapshot with source provenance and reject stale project-generation detail."
    },
    {
      "state": "permission",
      "contract": "Keep permitted summaries visible and withhold protected snapshot detail or commands explicitly."
    },
    {
      "state": "narrow",
      "contract": "Stack controls and evidence panels, preserve the selected mode, and keep visual/structured surfaces within the viewport."
    },
    {
      "state": "warm",
      "contract": "Restore source identity, mode, selected fact or visual target, structured page, compare target, and viewport for the same project."
    }
  ],
  "automatedEvidence": [
    "StateVisualCanvas.test.tsx",
    "state-isolation-contract.test.tsx",
    "commands/commands.test.ts"
  ],
  "browserOnlyCertification": [
    "Keyboard and screen-reader semantics for visual bounding-box controls.",
    "Retained-memory and interaction budget with 100,000 facts and large screenshots.",
    "Narrow mode switching and visual viewport containment."
  ]
} as const;
