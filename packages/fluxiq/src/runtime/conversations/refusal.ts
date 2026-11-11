// A conversation request refused for a reason a client acts on, named by a code.
//
// The program registry answers a thrown error's `diagnostic.code` as the
// response's `errorCode` (`programs/_shared/api.ts`), so a client tells "no such
// thread" from "a run is still using it" without matching prose. A thread the
// caller may not see is refused with exactly the code and the words a missing
// one is, so a refusal never says that a thread exists somewhere else.

/** The codes a conversation request may be refused with. */
export type AutomationStudioConversationRefusalCode =
  | "conversation_not_found"
  | "conversation_run_active"
  | "conversation_title_required"
  | "conversation_title_too_long"
  | "conversation_ambiguous";

const WORDS: Readonly<Record<AutomationStudioConversationRefusalCode, string>> = Object.freeze({
  conversation_not_found: "I could not find that conversation.",
  conversation_run_active: "This conversation is still being used by work that is running. Stop it or let it finish, then try again.",
  conversation_title_required: "A conversation needs a name with words in it.",
  conversation_title_too_long: "A conversation's name is at most 200 characters.",
  conversation_ambiguous: "More than one of your projects holds a conversation with that id. Name its project."
});

export class AutomationStudioConversationRefusal extends Error {
  readonly diagnostic: { readonly code: AutomationStudioConversationRefusalCode };

  constructor(code: AutomationStudioConversationRefusalCode) {
    super(WORDS[code]);
    this.name = "AutomationStudioConversationRefusal";
    this.diagnostic = Object.freeze({ code });
  }

  get code(): AutomationStudioConversationRefusalCode {
    return this.diagnostic.code;
  }
}
