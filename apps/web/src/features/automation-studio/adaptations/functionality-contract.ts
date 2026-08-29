import { automationStudioViewId } from "../views/view-registry";
export const adaptationsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.adaptations,
  "productPurpose": "Review, approve, apply, reject, inspect, and revert runtime adaptations without a separate Proposal concept.",
  "owningScope": [
    "project",
    "flow",
    "subflow"
  ],
  "data": {
    "requiredSummary": [
      "SQL-paged adaptation summaries",
      "status",
      "risk",
      "affected object names"
    ],
    "optionalDetail": [
      "changed fields",
      "evidence",
      "review history",
      "audit payload"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "subflowId",
      "status filters",
      "page offset",
      "adaptationId"
    ],
    "invalidationScopes": [
      "adaptation inbox",
      "affected Flow or Subflow",
      "runtime run",
      "problems"
    ]
  },
  "states": {
    "loading": "Keep inbox filters and cached summaries visible while a page or selected detail loads.",
    "empty": "Explain that no adaptations match the scope or status and link back to runtime activity when useful.",
    "stale": "Keep the selected comparison readable, label its revision stale, and block review until refreshed.",
    "error": "Separate inbox and detail failures and offer scoped retry.",
    "permission": "Allow audit inspection while disabling approve, apply, reject, and revert commands."
  },
  "scale": {
    "strategy": "sql-pagination-lazy-detail",
    "pageSize": 50,
    "mountedItemBudget": 100,
    "fixtureSize": 10000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Selecting a row loads only that adaptation; affected-object navigation opens the owning editor.",
  "commands": [
    {
      "name": "approve, apply, or reject",
      "pending": "Lock the selected adaptation action set and announce review progress.",
      "destructive": false
    },
    {
      "name": "revert adaptation",
      "pending": "Keep audit detail visible and prevent duplicate reverts.",
      "destructive": true,
      "confirmation": "Name the adaptation and summarize affected objects."
    }
  ],
  "accessibility": {
    "keyboard": "Inbox tabs, filters, rows, detail tabs, disclosures, and lifecycle actions are keyboard reachable.",
    "screenReader": "Announce status, risk, affected scope, changed-field count, and pending review outcome."
  },
  "narrowScreen": "Stack inbox and detail, keeping summaries first and comparisons horizontally contained.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Complete adaptation JSON is available only from the audit/detail disclosure."
  },
  "warmViewRestoration": "Restore inbox tab, filters, page, selected adaptation, detail tab, and disclosure state for the same scope.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Keep inbox filters and cached summaries visible while a page or selected detail loads."
    },
    {
      "state": "empty",
      "contract": "Explain that no adaptations match the scope or status and link back to runtime activity when useful."
    },
    {
      "state": "error",
      "contract": "Separate inbox and detail failures and offer scoped retry."
    },
    {
      "state": "stale",
      "contract": "Keep the selected comparison readable, label its revision stale, and block review until refreshed."
    },
    {
      "state": "permission",
      "contract": "Allow audit inspection while disabling approve, apply, reject, and revert commands."
    },
    {
      "state": "narrow",
      "contract": "Stack inbox and detail, keeping summaries first and comparisons horizontally contained."
    },
    {
      "state": "warm",
      "contract": "Restore inbox tab, filters, page, selected adaptation, detail tab, and disclosure state for the same scope."
    }
  ],
  "automatedEvidence": [
    "adaptations-view.test.tsx",
    "adaptations.test.ts",
    "large-project-behavior.test.tsx"
  ],
  "browserOnlyCertification": [
    "Focus restoration after review confirmation and async completion.",
    "Narrow changed-field comparison without page-level horizontal overflow.",
    "Screen-reader announcement of review status transitions."
  ]
} as const;
