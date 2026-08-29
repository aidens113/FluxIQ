import { automationStudioViewId } from "../views/view-registry";
export const recordingsFunctionalityContract = {
  "canonicalViewId": automationStudioViewId.recordingTimeline,
  "productPurpose": "Manage optional Recording evidence through paged lists, virtualized timelines, notes, markers, processing, and state navigation.",
  "owningScope": [
    "project",
    "flow",
    "recording"
  ],
  "data": {
    "requiredSummary": [
      "SQL-paged Recording summaries",
      "processing and lifecycle status",
      "timeline window summary"
    ],
    "optionalDetail": [
      "selected timeline event and neighbors",
      "notes",
      "markers",
      "state references"
    ],
    "cacheKeyParts": [
      "projectId",
      "flowId",
      "folderId",
      "recording filters",
      "recordingId",
      "timeline window"
    ],
    "invalidationScopes": [
      "recording directory",
      "selected Recording",
      "timeline window",
      "state index",
      "problems"
    ]
  },
  "states": {
    "loading": "Keep the list or timeline shell visible and load summary, timeline window, and selected event independently.",
    "empty": "Distinguish no Recordings, no folder results, and an empty Recording timeline with relevant actions.",
    "stale": "Keep evidence readable, mark it stale, and prevent stale generation responses from publishing.",
    "error": "Separate list, timeline, annotation, processing, and detail errors with scoped retry.",
    "permission": "Allow evidence inspection while disabling capture lifecycle, annotation, processing, archive, and delete commands."
  },
  "scale": {
    "strategy": "sql-pagination-and-virtualized-timeline",
    "pageSize": 50,
    "mountedItemBudget": 200,
    "fixtureSize": 100000,
    "modelBudgetMs": 50
  },
  "selectionBehavior": "Selecting a Recording opens its timeline; selecting an event loads only it and immediate neighbors and can open State or action detail.",
  "commands": [
    {
      "name": "start, stop, finalize, or process",
      "pending": "Show exact lifecycle progress and suppress duplicate transitions.",
      "destructive": false
    },
    {
      "name": "save note or marker",
      "pending": "Lock only the submitted annotation and retain text until accepted.",
      "destructive": false
    },
    {
      "name": "delete Recording",
      "pending": "Retain the selected evidence until atomic cleanup succeeds.",
      "destructive": true,
      "confirmation": "Name the Recording and explain linked evidence cleanup."
    }
  ],
  "accessibility": {
    "keyboard": "List rows, timeline clips, markers, notes, paging, and detail actions are keyboard reachable.",
    "screenReader": "Announce Recording status, timeline position, selected event, processing progress, and command errors."
  },
  "narrowScreen": "Stack list/timeline/detail, keep timeline navigation usable, and place secondary actions in a menu.",
  "rawDataAccess": {
    "relevant": true,
    "defaultClosed": true,
    "disclosure": "Raw event or state payload is detail-on-demand and never expanded for the full timeline."
  },
  "warmViewRestoration": "Restore folder, filters, page, Recording, timeline window, zoom, selected event, and open detail for the same project generation.",
  "behaviorMatrix": [
    {
      "state": "loading",
      "contract": "Keep the list or timeline shell visible and load summary, timeline window, and selected event independently."
    },
    {
      "state": "empty",
      "contract": "Distinguish no Recordings, no folder results, and an empty Recording timeline with relevant actions."
    },
    {
      "state": "error",
      "contract": "Separate list, timeline, annotation, processing, and detail errors with scoped retry."
    },
    {
      "state": "stale",
      "contract": "Keep evidence readable, mark it stale, and prevent stale generation responses from publishing."
    },
    {
      "state": "permission",
      "contract": "Allow evidence inspection while disabling capture lifecycle, annotation, processing, archive, and delete commands."
    },
    {
      "state": "narrow",
      "contract": "Stack list/timeline/detail, keep timeline navigation usable, and place secondary actions in a menu."
    },
    {
      "state": "warm",
      "contract": "Restore folder, filters, page, Recording, timeline window, zoom, selected event, and open detail for the same project generation."
    }
  ],
  "automatedEvidence": [
    "recording-ownership.test.ts",
    "large-project-behavior.test.tsx",
    "commands/commands.test.ts"
  ],
  "browserOnlyCertification": [
    "Virtualized timeline keyboard navigation with 100,000 events.",
    "Warm zoom, scroll-window, and selected-event restoration.",
    "Narrow timeline controls and processing overlay focus behavior."
  ]
} as const;
