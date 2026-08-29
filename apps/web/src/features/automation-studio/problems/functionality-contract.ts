import { automationStudioViewId } from "../views/view-registry";
export const problemsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.problems,
  "productPurpose": "Normalize, filter, and navigate actionable validation and runtime Problems without hidden recomputation.",
  "owningScope": [
    "project",
    "flow",
    "selection"
  ],
  "data": {
    "requiredSummary": [
      "bounded normalized diagnostics",
      "severity counts",
      "scope labels",
      "validation status"
    ],
    "optionalDetail": [
      "selected Problem target",
      "actionable diagnostic detail",
      "current-object relationship"
    ],
    "cacheKeyParts": [
      "projectId",
      "validation revision",
      "severity filter",
      "scope filter",
      "search",
      "page"
    ],
    "invalidationScopes": [
      "project validation",
      "Flow graph",
      "instructions",
      "settings",
      "runtime and Recording evidence"
    ]
  },
  "states": {
    "loading": "Show validation progress without recomputing or accepting commands while the view is inactive.",
    "empty": "Confirm that the selected scope has no Problems and keep filters understandable.",
    "stale": "Keep prior diagnostics visible, label them stale, and enable refresh only while active.",
    "error": "Show validation failure and an active-only retry without discarding current-object context.",
    "permission": "Explain that validation is unavailable and disable refresh or navigation requiring denied detail."
  },
  "scale": {
    "strategy": "bounded-scan-and-pagination",
    "pageSize": 100,
    "mountedItemBudget": 100,
    "fixtureSize": 20000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Current-object focus filters without losing project counts; selecting a Problem navigates to its typed target.",
  "commands": [
    {
      "name": "request validation",
      "pending": "Disable duplicate validation and announce progress while active.",
      "destructive": false
    },
    {
      "name": "open Problem target",
      "pending": "Publish navigation intent without triggering hidden validation.",
      "destructive": false
    }
  ],
  "accessibility": {
    "keyboard": "Severity, scope, search, rows, paging, and refresh are keyboard reachable.",
    "screenReader": "Announce severity counts, validation state, current-object scope, page position, and target action."
  },
  "narrowScreen": "Stack filters and details, keep compact rows readable, and avoid horizontal overflow for long messages.",
  "rawDataAccess": {
    "relevant": false,
    "defaultClosed": true,
    "disclosure": "Problems use normalized friendly diagnostics; raw project or graph JSON is not exposed."
  },
  "warmViewRestoration": "Restore filters, page, current-object focus, selected Problem, and scroll position; remain inactive without validation work.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Show validation progress without recomputing or accepting commands while the view is inactive."
    },
    {
      "state": "empty",
      "contract": "Confirm that the selected scope has no Problems and keep filters understandable."
    },
    {
      "state": "error",
      "contract": "Show validation failure and an active-only retry without discarding current-object context."
    },
    {
      "state": "stale",
      "contract": "Keep prior diagnostics visible, label them stale, and enable refresh only while active."
    },
    {
      "state": "permission",
      "contract": "Explain that validation is unavailable and disable refresh or navigation requiring denied detail."
    },
    {
      "state": "narrow",
      "contract": "Stack filters and details, keep compact rows readable, and avoid horizontal overflow for long messages."
    },
    {
      "state": "warm",
      "contract": "Restore filters, page, current-object focus, selected Problem, and scroll position; remain inactive without validation work."
    }
  ],
  "automatedEvidence": [
    "problem-host.test.ts",
    "problems-view.test.tsx",
    "problems-large.test.ts"
  ],
  "browserOnlyCertification": [
    "Screen-reader live-region behavior for loading, stale, denied, and error validation states.",
    "Warm inactive-to-active restoration without duplicate validation.",
    "Narrow filter and long-diagnostic row containment."
  ]
} as const;
