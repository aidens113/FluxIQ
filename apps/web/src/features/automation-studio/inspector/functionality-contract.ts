import { automationStudioViewId } from "../views/view-registry";
export const inspectorFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.inspector,
  "productPurpose": "Inspect and edit only the typed properties relevant to the current Studio selection.",
  "owningScope": [
    "project",
    "selection"
  ],
  "data": {
    "requiredSummary": [
      "selected entity identity",
      "entity kind",
      "bounded status summary"
    ],
    "optionalDetail": [
      "typed panel fields",
      "references",
      "provenance",
      "field validation"
    ],
    "cacheKeyParts": [
      "projectId",
      "selection kind",
      "selection id",
      "entity revision"
    ],
    "invalidationScopes": [
      "selected entity",
      "references for selected entity",
      "problems"
    ]
  },
  "states": {
    "loading": "Show the selected identity and panel skeleton while only its bounded detail resolves.",
    "empty": "Explain that no object is selected and do no entity lookup work.",
    "stale": "Keep the selected panel visible, identify stale fields, and refresh only the selected entity.",
    "error": "Keep identity and unaffected sections visible with a scoped retry.",
    "permission": "Render readable fields while disabling protected edits and hiding unauthorized detail explicitly."
  },
  "scale": {
    "strategy": "single-selection-bounded-panels",
    "pageSize": 100,
    "mountedItemBudget": 100,
    "fixtureSize": 10000,
    "modelBudgetMs": 30
  },
  "selectionBehavior": "The Inspector follows semantic selection and never receives or scans every project collection.",
  "commands": [
    {
      "name": "save selected properties",
      "pending": "Lock only the owning panel and announce field-level save progress.",
      "destructive": false
    },
    {
      "name": "remove selected reference or object",
      "pending": "Keep the selected identity until the accepted mutation.",
      "destructive": true,
      "confirmation": "Name the object and the exact reference or object effect."
    }
  ],
  "accessibility": {
    "keyboard": "Panel sections, fields, reference links, validation, and actions follow selection order.",
    "screenReader": "Announce selected kind and name, section labels, field errors, read-only reason, and save status."
  },
  "narrowScreen": "Use one stacked panel column with wrapping values and reachable actions; technical identifiers do not displace names.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Raw metadata or provenance may be disclosed for the selected entity only, never for the whole project."
  },
  "warmViewRestoration": "Restore expanded sections, local field draft, and scroll position only while the same semantic selection remains current.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Show the selected identity and panel skeleton while only its bounded detail resolves."
    },
    {
      "state": "empty",
      "contract": "Explain that no object is selected and do no entity lookup work."
    },
    {
      "state": "error",
      "contract": "Keep identity and unaffected sections visible with a scoped retry."
    },
    {
      "state": "stale",
      "contract": "Keep the selected panel visible, identify stale fields, and refresh only the selected entity."
    },
    {
      "state": "permission",
      "contract": "Render readable fields while disabling protected edits and hiding unauthorized detail explicitly."
    },
    {
      "state": "narrow",
      "contract": "Use one stacked panel column with wrapping values and reachable actions; technical identifiers do not displace names."
    },
    {
      "state": "warm",
      "contract": "Restore expanded sections, local field draft, and scroll position only while the same semantic selection remains current."
    }
  ],
  "automatedEvidence": [
    "large-project-behavior.test.tsx",
    "scoped-selection.test.ts",
    "product-vocabulary.test.ts"
  ],
  "browserOnlyCertification": [
    "Focus transfer when semantic selection changes between object kinds.",
    "Narrow long-name and long-value containment at 320 CSS pixels.",
    "Screen-reader announcement of read-only permission reasons and async field saves."
  ]
} as const;
