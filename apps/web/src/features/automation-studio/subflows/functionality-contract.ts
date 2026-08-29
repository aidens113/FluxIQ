import { automationStudioViewId } from "../views/view-registry";
export const subflowsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.subflows,
  "productPurpose": "Browse and manage a Flow's Subflows and nested categories as a scalable directory.",
  "owningScope": [
    "project",
    "flow"
  ],
  "data": {
    "requiredSummary": [
      "category path",
      "SQL-paged Subflow summaries",
      "status and readiness",
      "Router reverse-reference counts"
    ],
    "optionalDetail": [
      "selected Subflow metadata",
      "named Router references",
      "lifecycle constraints"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "categoryId",
      "search",
      "status",
      "cursor or offset"
    ],
    "invalidationScopes": [
      "subflow directory",
      "hierarchy siblings",
      "flow router",
      "problems"
    ]
  },
  "states": {
    "loading": "Keep directory controls and cached rows visible while the requested SQL page loads.",
    "empty": "Distinguish an empty Flow, empty category, and no search matches; expose Create Subflow or Create Category.",
    "stale": "Render the last page with a stale label and refresh only that directory scope.",
    "error": "Show a retryable page error without embedding a Flow editor or clearing unrelated categories.",
    "permission": "Allow navigation and inspection while disabling create, rename, duplicate, archive, and delete."
  },
  "scale": {
    "strategy": "sql-pagination",
    "pageSize": 50,
    "mountedItemBudget": 50,
    "fixtureSize": 10000,
    "modelBudgetMs": 40
  },
  "selectionBehavior": "A row selection opens the Subflow Nodes view through normal workspace navigation; technical IDs remain secondary.",
  "commands": [
    {
      "name": "create, rename, or duplicate",
      "pending": "Lock only the affected directory transaction and preserve the current page.",
      "destructive": false
    },
    {
      "name": "archive Subflow",
      "pending": "Show lifecycle progress on the selected row.",
      "destructive": true,
      "confirmation": "Name the Subflow and explain Router availability."
    },
    {
      "name": "delete Subflow or category",
      "pending": "Prevent duplicate submission and retain the confirmed target.",
      "destructive": true,
      "confirmation": "Name the target and summarize affected descendants or Router references."
    }
  ],
  "accessibility": {
    "keyboard": "Arrow keys traverse visible hierarchy rows; Enter opens Nodes; context actions remain keyboard reachable.",
    "screenReader": "Announce level, expanded state, Subflow status, readiness, and page position."
  },
  "narrowScreen": "Use one-column rows with actions in a menu; never embed a second graph editor.",
  "rawDataAccess": {
    "relevant": false,
    "defaultClosed": true,
    "disclosure": "No raw JSON surface is part of the directory; IDs may appear only as secondary technical detail."
  },
  "warmViewRestoration": "Restore category expansion, search, status, page cursor, selected row, and scroll anchor for the same Flow.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Keep directory controls and cached rows visible while the requested SQL page loads."
    },
    {
      "state": "empty",
      "contract": "Distinguish an empty Flow, empty category, and no search matches; expose Create Subflow or Create Category."
    },
    {
      "state": "error",
      "contract": "Show a retryable page error without embedding a Flow editor or clearing unrelated categories."
    },
    {
      "state": "stale",
      "contract": "Render the last page with a stale label and refresh only that directory scope."
    },
    {
      "state": "permission",
      "contract": "Allow navigation and inspection while disabling create, rename, duplicate, archive, and delete."
    },
    {
      "state": "narrow",
      "contract": "Use one-column rows with actions in a menu; never embed a second graph editor."
    },
    {
      "state": "warm",
      "contract": "Restore category expansion, search, status, page cursor, selected row, and scroll anchor for the same Flow."
    }
  ],
  "automatedEvidence": [
    "subflows-view.test.tsx",
    "subflows.test.ts",
    "large-project-behavior.test.ts"
  ],
  "browserOnlyCertification": [
    "Roving tree focus and expansion announcements with a screen reader.",
    "Narrow action-menu containment at 320 CSS pixels.",
    "Warm scroll-anchor restoration after opening and returning from Nodes."
  ]
} as const;
