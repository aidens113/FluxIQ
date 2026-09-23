import { automationStudioViewId } from "../views";

/**
 * What the conversation view owes a person, stated once and asserted by the
 * canonical view functionality gate rather than left to a reviewer.
 */
export const conversationFunctionalityContract = {
  canonicalViewId: automationStudioViewId.conversation,
  productPurpose: "Hold one ordered exchange between FluxIQ and the person, and let them answer what it asked without a purpose-built screen for each question.",
  owningScope: [
    "project",
    "flow"
  ],
  data: {
    requiredSummary: [
      "open conversations for the project",
      "subject of each conversation",
      "whether a question is waiting"
    ],
    optionalDetail: [
      "ordered turns with author and time",
      "the ask a turn carries and its options",
      "an attachment a turn references"
    ],
    cacheKeyParts: [
      "projectId",
      "conversationId",
      "last held turnId"
    ],
    invalidationScopes: [
      "conversation turns",
      "conversation status",
      "runtime run that owns the thread"
    ]
  },
  states: {
    loading: "Show that the thread is being read without discarding turns already held or accepting an answer twice.",
    empty: "Say that nothing has been said yet and invite the person to write first.",
    stale: "Keep held turns visible while a read fails, and keep the backoff running rather than freezing the thread.",
    error: "Name what could not be read or sent, leave the transcript intact, and let the person try again.",
    permission: "An answer with a lasting effect asks for the security PIN again before it is sent, and a refusal sends nothing."
  },
  scale: {
    strategy: "tail-window-with-cursor-reads",
    pageSize: 100,
    mountedItemBudget: 200,
    fixtureSize: 5000,
    modelBudgetMs: 50
  },
  selectionBehavior: "Choosing a conversation replaces the transcript and restarts the read from its first turn; the selection is reported so a warm tab reopens on the same thread.",
  commands: [
    {
      name: "send a reply",
      pending: "Disable the composer while the turn is in flight and clear it only once Core accepted the turn.",
      destructive: false
    },
    {
      name: "answer an ask",
      pending: "Disable every answer button while one is in flight, because an ask is answered once and a second answer is refused.",
      destructive: true,
      confirmation: "An answer that grants a consequence class or picks a destructive option re-asks for the security PIN before it is sent."
    },
    {
      name: "read the thread again",
      pending: "Restart the backoff at its fast beat and never run two reads at once.",
      destructive: false
    }
  ],
  accessibility: {
    keyboard: "The conversation picker, every turn's answer buttons, the composer and the show-earlier control are reachable and operable from the keyboard.",
    screenReader: "The transcript is a polite live region, so an arriving turn is announced; each turn names its author and time, and an ask is a labelled group."
  },
  narrowScreen: "Stack the picker above the transcript, let turns wrap rather than scroll sideways, and keep the composer and answer buttons full width.",
  rawDataAccess: {
    relevant: false,
    defaultClosed: true,
    disclosure: "A turn renders only what Core built and its strict parser accepted; raw conversation JSON is never exposed in the thread."
  },
  warmViewRestoration: "A warm tab keeps its transcript and its selected conversation, and stops polling until it is active again so a background thread costs nothing.",
  behaviorMatrix: [
    {
      state: "loading",
      contract: "Show that the thread is being read without discarding turns already held or accepting an answer twice."
    },
    {
      state: "empty",
      contract: "Say that nothing has been said yet and invite the person to write first."
    },
    {
      state: "error",
      contract: "Name what could not be read or sent, leave the transcript intact, and let the person try again."
    },
    {
      state: "stale",
      contract: "Keep held turns visible while a read fails, and keep the backoff running rather than freezing the thread."
    },
    {
      state: "permission",
      contract: "An answer with a lasting effect asks for the security PIN again before it is sent, and a refusal sends nothing."
    },
    {
      state: "narrow",
      contract: "Stack the picker above the transcript, let turns wrap rather than scroll sideways, and keep the composer and answer buttons full width."
    },
    {
      state: "warm",
      contract: "A warm tab keeps its transcript and its selected conversation, and stops polling until it is active again so a background thread costs nothing."
    }
  ],
  automatedEvidence: [
    "conversation/tests/thread-model.test.ts",
    "conversation/tests/conversation-view.test.tsx",
    "conversation/tests/conversation-architecture.test.ts"
  ],
  browserOnlyCertification: [
    "A turn arriving from a server-side run while the tab is in the background, announced when the tab becomes visible again.",
    "Tail-following: an arriving turn scrolls into view only when the person was already at the bottom of the transcript.",
    "The re-authorization dialog taking focus, trapping it, and returning it to the answer button when it is cancelled."
  ]
} as const;
