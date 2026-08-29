import { automationStudioViewId } from "../views/view-registry";
export const routerFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.router,
  "productPurpose": "Route a top-level Flow through ordered Subflow targets without loading Subflow graphs.",
  "owningScope": [
    "project",
    "flow"
  ],
  "data": {
    "requiredSummary": [
      "Flow identity",
      "Subflow summaries",
      "ordered route and group summaries",
      "fallback summary"
    ],
    "optionalDetail": [
      "condition operands",
      "test result explanation",
      "route diagnostics",
      "authorization detail"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "router revision",
      "route page"
    ],
    "invalidationScopes": [
      "flow router",
      "subflow directory",
      "problems"
    ]
  },
  "states": {
    "loading": "Keep the Router shell and Flow identity visible while bounded route and Subflow summaries load.",
    "empty": "Explain that routing needs Subflows and expose Create Subflow before route controls.",
    "stale": "Keep the last router readable, label it out of date, and offer a current-scope retry.",
    "error": "Show the failed resource and retry without discarding the last accepted router.",
    "permission": "Keep routes readable and disable protected create, edit, test, reorder, and delete commands."
  },
  "scale": {
    "strategy": "bounded-window",
    "pageSize": 100,
    "mountedItemBudget": 100,
    "fixtureSize": 5000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Selecting a route or group updates only Router-local detail; target navigation opens the selected Subflow Nodes view.",
  "commands": [
    {
      "name": "create or edit route",
      "pending": "Disable the submitted route row and announce saving.",
      "destructive": false
    },
    {
      "name": "test condition",
      "pending": "Keep the route stable and announce evaluation progress.",
      "destructive": false
    },
    {
      "name": "delete route or group",
      "pending": "Lock the confirmed target until the command settles.",
      "destructive": true,
      "confirmation": "Name the route or group and describe fallback impact."
    }
  ],
  "accessibility": {
    "keyboard": "Tab reaches groups, rows, condition controls, test, and target navigation in route order.",
    "screenReader": "Announce ordered position, target, status, pending result, and errors."
  },
  "narrowScreen": "Collapse route details below the selected row and keep primary actions reachable without horizontal page scrolling.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Raw condition and evaluator detail is secondary to structured controls and friendly explanations."
  },
  "warmViewRestoration": "Restore selected route, filters, scroll window, and unsaved local condition draft only for the same project and Flow generation.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Keep the Router shell and Flow identity visible while bounded route and Subflow summaries load."
    },
    {
      "state": "empty",
      "contract": "Explain that routing needs Subflows and expose Create Subflow before route controls."
    },
    {
      "state": "error",
      "contract": "Show the failed resource and retry without discarding the last accepted router."
    },
    {
      "state": "stale",
      "contract": "Keep the last router readable, label it out of date, and offer a current-scope retry."
    },
    {
      "state": "permission",
      "contract": "Keep routes readable and disable protected create, edit, test, reorder, and delete commands."
    },
    {
      "state": "narrow",
      "contract": "Collapse route details below the selected row and keep primary actions reachable without horizontal page scrolling."
    },
    {
      "state": "warm",
      "contract": "Restore selected route, filters, scroll window, and unsaved local condition draft only for the same project and Flow generation."
    }
  ],
  "automatedEvidence": [
    "router-view.test.tsx",
    "router.test.ts",
    "large-project-behavior.test.ts"
  ],
  "browserOnlyCertification": [
    "Keyboard reorder and focus retention across a saved route mutation.",
    "Narrow-screen route editing at 320 CSS pixels.",
    "Screen-reader announcement of asynchronous condition-test results."
  ]
} as const;
