import { automationStudioViewId } from "../views/view-registry";
export const settingsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.settings,
  "productPurpose": "Configure typed Flow and Subflow runtime, LLM, adaptation, safety, interface, dependency, and limit settings.",
  "owningScope": [
    "project",
    "flow",
    "subflow"
  ],
  "data": {
    "requiredSummary": [
      "effective settings",
      "inheritance sources",
      "provider and encrypted-key summaries",
      "publication summaries"
    ],
    "optionalDetail": [
      "editable overrides",
      "interface mappings",
      "dependencies",
      "validation issues"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "subflowId or Flow",
      "settings revision"
    ],
    "invalidationScopes": [
      "flow or Subflow settings",
      "runtime readiness",
      "LLM key summaries",
      "problems"
    ]
  },
  "states": {
    "loading": "Render the settings navigation and disabled typed controls while effective settings and key summaries load.",
    "empty": "Populate documented defaults and clearly distinguish inherited values from explicit overrides.",
    "stale": "Keep unsaved edits, mark the server revision stale, and require conflict-aware reload or save.",
    "error": "Attach validation errors to sections or fields and preserve the dirty draft.",
    "permission": "Allow settings inspection and effective-source review while disabling persistence and protected lifecycle actions."
  },
  "scale": {
    "strategy": "bounded-form-sections",
    "pageSize": 200,
    "mountedItemBudget": 200,
    "fixtureSize": 10000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Section selection is local to the settings view; Flow and Subflow settings use distinct typed models.",
  "commands": [
    {
      "name": "save settings transaction",
      "pending": "Disable the single save action, retain dirty fields, and announce progress.",
      "destructive": false
    },
    {
      "name": "reset override",
      "pending": "Update the draft locally and persist only in the next single transaction.",
      "destructive": false
    },
    {
      "name": "archive or disable Subflow",
      "pending": "Lock lifecycle controls until the accepted response.",
      "destructive": true,
      "confirmation": "Name the Subflow and describe runtime availability."
    }
  ],
  "accessibility": {
    "keyboard": "Section navigation, typed controls, reset actions, validation summary, and save footer are keyboard reachable.",
    "screenReader": "Announce inheritance source, field error, dirty state, save progress, and effective value."
  },
  "narrowScreen": "Use stacked form sections, full-width controls, and an unobscured save footer without a statistics header.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Raw metadata is optional diagnostic disclosure; every supported editable setting uses a typed control."
  },
  "warmViewRestoration": "Restore active section, scroll position, dirty overrides, and validation for the same settings entity.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Render the settings navigation and disabled typed controls while effective settings and key summaries load."
    },
    {
      "state": "empty",
      "contract": "Populate documented defaults and clearly distinguish inherited values from explicit overrides."
    },
    {
      "state": "error",
      "contract": "Attach validation errors to sections or fields and preserve the dirty draft."
    },
    {
      "state": "stale",
      "contract": "Keep unsaved edits, mark the server revision stale, and require conflict-aware reload or save."
    },
    {
      "state": "permission",
      "contract": "Allow settings inspection and effective-source review while disabling persistence and protected lifecycle actions."
    },
    {
      "state": "narrow",
      "contract": "Use stacked form sections, full-width controls, and an unobscured save footer without a statistics header."
    },
    {
      "state": "warm",
      "contract": "Restore active section, scroll position, dirty overrides, and validation for the same settings entity."
    }
  ],
  "automatedEvidence": [
    "settings-view.test.tsx",
    "settings.test.ts",
    "large-project-behavior.test.tsx"
  ],
  "browserOnlyCertification": [
    "Focus moves from validation summary to the first invalid typed control.",
    "Narrow sticky-footer and long provider/model label containment.",
    "Screen-reader announcement of inherited versus overridden values."
  ]
} as const;
