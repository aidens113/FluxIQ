import { automationStudioViewId } from "../views/view-registry";
export const instructionsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.instructions,
  "productPurpose": "Author deterministic and LLM guidance at global, Flow, Router, Subflow, node, error, and adaptation-review scopes.",
  "owningScope": [
    "project",
    "flow",
    "subflow",
    "selection"
  ],
  "data": {
    "requiredSummary": [
      "SQL-paged instruction summaries",
      "scope and target names",
      "priority and requirement",
      "effective-order diagnostics"
    ],
    "optionalDetail": [
      "instruction body",
      "effective precedence",
      "conflicts and shadowing",
      "draft recovery"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "scope filters",
      "sort",
      "page offset",
      "instructionId"
    ],
    "invalidationScopes": [
      "instruction directory",
      "effective instruction set",
      "flow readiness",
      "problems"
    ]
  },
  "states": {
    "loading": "Show the directory/editor frame and cached page while list or selected detail loads independently.",
    "empty": "Offer practical templates and Create Instruction while explaining the current scope.",
    "stale": "Preserve the draft and last accepted detail, mark server data stale, and require conflict-aware refresh.",
    "error": "Separate list and detail errors and keep recoverable drafts available.",
    "permission": "Keep effective guidance readable while disabling create, edit, delete, enable, and disable."
  },
  "scale": {
    "strategy": "sql-pagination-detail-on-demand",
    "pageSize": 50,
    "mountedItemBudget": 50,
    "fixtureSize": 10000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Selecting an instruction loads only that detail and guards navigation when its local draft is dirty.",
  "commands": [
    {
      "name": "create or save instruction",
      "pending": "Disable the active editor submit and announce validation or save progress.",
      "destructive": false
    },
    {
      "name": "enable or disable instruction",
      "pending": "Update only the selected summary after current-generation acceptance.",
      "destructive": false
    },
    {
      "name": "delete instruction",
      "pending": "Retain the draft until deletion succeeds and suppress duplicate submission.",
      "destructive": true,
      "confirmation": "Name the instruction and its effective scope."
    }
  ],
  "accessibility": {
    "keyboard": "Directory, scope controls, editor sections, diagnostics, and save footer follow a predictable tab order.",
    "screenReader": "Associate validation with fields and announce dirty, saving, saved, conflict, and error states."
  },
  "narrowScreen": "Stack directory and editor as switchable inner views with a persistent save action and no clipped inputs.",
  "rawDataAccess": {
    "relevant": false,
    "defaultClosed": true,
    "disclosure": "Structured fields and body text are primary; raw JSON is not an instruction editing mode."
  },
  "warmViewRestoration": "Restore filters, page, selected instruction, editor section, cursor-neutral draft, and dirty status for the same scope.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Show the directory/editor frame and cached page while list or selected detail loads independently."
    },
    {
      "state": "empty",
      "contract": "Offer practical templates and Create Instruction while explaining the current scope."
    },
    {
      "state": "error",
      "contract": "Separate list and detail errors and keep recoverable drafts available."
    },
    {
      "state": "stale",
      "contract": "Preserve the draft and last accepted detail, mark server data stale, and require conflict-aware refresh."
    },
    {
      "state": "permission",
      "contract": "Keep effective guidance readable while disabling create, edit, delete, enable, and disable."
    },
    {
      "state": "narrow",
      "contract": "Stack directory and editor as switchable inner views with a persistent save action and no clipped inputs."
    },
    {
      "state": "warm",
      "contract": "Restore filters, page, selected instruction, editor section, cursor-neutral draft, and dirty status for the same scope."
    }
  ],
  "automatedEvidence": [
    "instructions-view.test.tsx",
    "instructions.test.ts",
    "large-project-behavior.test.ts"
  ],
  "browserOnlyCertification": [
    "Dirty-navigation focus and announcement through the confirmation overlay.",
    "Narrow directory/editor switching with the sticky save footer.",
    "Screen-reader association for scope-target validation and save status."
  ]
} as const;
