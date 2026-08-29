import { automationStudioViewId } from "../views/view-registry";
export const runtimeFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.runtime,
  "productPurpose": "Launch a Flow and inspect SQL-paged Run history, ordered actions, events, state, effects, routing, recovery, and LLM activity.",
  "owningScope": [
    "project",
    "flow"
  ],
  "data": {
    "requiredSummary": [
      "SQL-paged Run summaries",
      "runtime readiness",
      "selected Run compact detail"
    ],
    "optionalDetail": [
      "paginated actions",
      "cursor-paged events",
      "state and effect evidence",
      "LLM, token, cost, routing, and recovery detail"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "run filters",
      "run page offset",
      "runId",
      "action offset",
      "event cursor"
    ],
    "invalidationScopes": [
      "run history",
      "selected Run detail",
      "runtime readiness",
      "adaptations",
      "state index"
    ]
  },
  "states": {
    "loading": "Show the debug shell immediately, skeleton only the requested Run page, and open a selected log before detail hydration.",
    "empty": "Offer mode selection and Run for a ready Flow while previous-runs history explains that no Runs exist.",
    "stale": "Keep completed history readable, mark active detail stale, and resume from bounded current-scope queries.",
    "error": "Isolate launch, history, detail, action, and event errors with independent retries.",
    "permission": "Keep authorized history readable while disabling launch, cancel, audit export, or protected detail as appropriate."
  },
  "scale": {
    "strategy": "sql-pagination-and-cursor-stream",
    "pageSize": 50,
    "mountedItemBudget": 100,
    "fixtureSize": 100000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Run rows are single-line and clickable; selecting one immediately opens its log shell before bounded detail requests.",
  "commands": [
    {
      "name": "start and execute Run",
      "pending": "Show queued/running state and disable duplicate Run submission.",
      "destructive": false
    },
    {
      "name": "cancel Run",
      "pending": "Lock the active Run command and announce cancellation progress.",
      "destructive": true,
      "confirmation": "Name the active Run and explain that completed effects are not undone."
    },
    {
      "name": "export audit",
      "pending": "Build the audit artifact off the render path and announce download readiness.",
      "destructive": false
    }
  ],
  "accessibility": {
    "keyboard": "Mode selection, Run, compact history rows, action/event paging, tabs, and disclosures are keyboard reachable.",
    "screenReader": "Announce Run status, selected row, ordered action position, retries, pending commands, and errors."
  },
  "narrowScreen": "Keep compact one-line rows, move pagination to the bottom, stack detail panels, and avoid page-level horizontal scrolling.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Inputs, outputs, events, attempts, and audit JSON are opt-in disclosures or export, never required for ordinary launch."
  },
  "warmViewRestoration": "Restore mode, filters, history page, selected Run, detail tab, action page, event cursor, and disclosure state for the same Flow.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Show the debug shell immediately, skeleton only the requested Run page, and open a selected log before detail hydration."
    },
    {
      "state": "empty",
      "contract": "Offer mode selection and Run for a ready Flow while previous-runs history explains that no Runs exist."
    },
    {
      "state": "error",
      "contract": "Isolate launch, history, detail, action, and event errors with independent retries."
    },
    {
      "state": "stale",
      "contract": "Keep completed history readable, mark active detail stale, and resume from bounded current-scope queries."
    },
    {
      "state": "permission",
      "contract": "Keep authorized history readable while disabling launch, cancel, audit export, or protected detail as appropriate."
    },
    {
      "state": "narrow",
      "contract": "Keep compact one-line rows, move pagination to the bottom, stack detail panels, and avoid page-level horizontal scrolling."
    },
    {
      "state": "warm",
      "contract": "Restore mode, filters, history page, selected Run, detail tab, action page, event cursor, and disclosure state for the same Flow."
    }
  ],
  "automatedEvidence": [
    "runtime.test.tsx",
    "runtime-views.test.tsx",
    "large-project-behavior.test.tsx"
  ],
  "browserOnlyCertification": [
    "Long-task and retained-heap budget while opening a 100,000-event Run.",
    "Warm Run-tab restoration without duplicate detail requests.",
    "Narrow keyboard traversal of compact rows, bottom pagination, and detail disclosures."
  ]
} as const;
