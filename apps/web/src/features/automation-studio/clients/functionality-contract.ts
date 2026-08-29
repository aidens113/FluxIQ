import { automationStudioViewId } from "../views/view-registry";
export const clientsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.clients,
  "productPurpose": "Connect, pair, monitor, authorize, and control automation clients while separating global client state from project context.",
  "owningScope": [
    "global-client",
    "project"
  ],
  "data": {
    "requiredSummary": [
      "paged client and session summaries",
      "pairing state",
      "activity status"
    ],
    "optionalDetail": [
      "capabilities",
      "connection diagnostics",
      "trusted-client detail",
      "audit entries"
    ],
    "cacheKeyParts": [
      "global gateway revision",
      "projectId filter",
      "client page",
      "selected session"
    ],
    "invalidationScopes": [
      "client gateway",
      "pairings",
      "trusted clients",
      "session activity",
      "recording status"
    ]
  },
  "states": {
    "loading": "Keep gateway controls and cached client summaries visible during an active-only refresh.",
    "empty": "Explain disconnected, no pairing, and no project session states with the relevant connect or pair action.",
    "stale": "Mark cached connection state stale after deactivation and refresh only when active again.",
    "error": "Preserve known clients and show scoped connection or command errors with retry.",
    "permission": "Keep connection summaries visible while disabling recording, execute, trust, revoke, or pairing actions."
  },
  "scale": {
    "strategy": "active-only-polling-and-pagination",
    "pageSize": 100,
    "mountedItemBudget": 100,
    "fixtureSize": 10000,
    "modelBudgetMs": 40
  },
  "selectionBehavior": "Session selection remains stable across refreshes and falls back deterministically when the selected session disappears.",
  "commands": [
    {
      "name": "pair, start, stop, or execute",
      "pending": "Lock the selected client action and announce authorization and transport progress.",
      "destructive": false
    },
    {
      "name": "revoke trusted client",
      "pending": "Keep the trusted-client identity visible until revocation settles.",
      "destructive": true,
      "confirmation": "Name the client and explain that it must pair again."
    }
  ],
  "accessibility": {
    "keyboard": "Client rows, pairing controls, activity, refresh, authorization, and lifecycle actions are keyboard reachable.",
    "screenReader": "Announce connection state, capability count, polling errors, authorization state, and action result."
  },
  "narrowScreen": "Stack client list and selected detail, use action menus, and keep pairing codes and status text contained.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Connection diagnostics and audit payloads are opt-in; ordinary lifecycle actions use typed controls."
  },
  "warmViewRestoration": "Restore selected session, client page, filters, and open detail; resume polling only when the view becomes active.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Keep gateway controls and cached client summaries visible during an active-only refresh."
    },
    {
      "state": "empty",
      "contract": "Explain disconnected, no pairing, and no project session states with the relevant connect or pair action."
    },
    {
      "state": "error",
      "contract": "Preserve known clients and show scoped connection or command errors with retry."
    },
    {
      "state": "stale",
      "contract": "Mark cached connection state stale after deactivation and refresh only when active again."
    },
    {
      "state": "permission",
      "contract": "Keep connection summaries visible while disabling recording, execute, trust, revoke, or pairing actions."
    },
    {
      "state": "narrow",
      "contract": "Stack client list and selected detail, use action menus, and keep pairing codes and status text contained."
    },
    {
      "state": "warm",
      "contract": "Restore selected session, client page, filters, and open detail; resume polling only when the view becomes active."
    }
  ],
  "automatedEvidence": [
    "active-poller.test.ts",
    "large-project-behavior.test.ts"
  ],
  "browserOnlyCertification": [
    "Active/inactive polling certification with real visibility and tab changes.",
    "Focus behavior through authorization and revoke confirmation overlays.",
    "Narrow pairing-code, status, and capability-list containment."
  ]
} as const;
