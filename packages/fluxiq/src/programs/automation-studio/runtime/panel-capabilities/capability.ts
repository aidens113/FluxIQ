// One thing the control panel can do, said in terms a model can choose from.
//
// **Why this contract is in Core rather than in the panel.** The panel already
// declares its capabilities once, in
// `apps/web/src/features/automation-studio/conversation/capabilities/`, and a
// build-failing test there proves no panel write exists without a
// conversational path. What was missing was the crossing: the model that would
// pick one of them runs in Core, and there was no browser-safe Core surface for
// the browser to hand its vocabulary across. So the panel knew 38 things it
// could do and the model knew none of them, and a person typing "run the flow"
// wrote a row into a transcript that nothing read back.
//
// **This is a carrier, not a second catalog.** Core declares no capability of
// its own here and must not: two lists would drift, and a model told about a
// capability the panel does not have would answer for something that cannot
// happen. The panel's registry stays the single declaration; these types are the
// shape it travels in, and `vocabulary.ts` is how it is put in front of a model.
//
// Browser-safe by construction: types only, no import, nothing from `node:`.
// `client/index.ts` publishes it and `client/tests/index.test.ts` pins that it
// stays that way.

/** A value a capability takes, described for whoever has to supply it. */
export type AutomationStudioPanelCapabilityArgument = {
  name: string;
  /** One sentence, written for the model or the person filling it in. */
  describe: string;
  /**
   * Whether the capability cannot run at all without it.
   *
   * Nearly everything is optional on purpose. A capability has to be usable on
   * the fewest parameters that can possibly work -- the panel fills the rest
   * from what is on screen -- because demanding every argument up front is how a
   * model is made to fail at the first attempt instead of being corrected on the
   * second.
   */
  required: boolean;
};

/**
 * One capability, as the model is shown it.
 *
 * The fields are exactly what the panel's `panelCapabilityVocabulary()`
 * produces, so the browser hands its own list straight across with no
 * translation step to fall out of date.
 */
export type AutomationStudioPanelCapability = {
  /** Stable and dotted -- `flow.build`, `run.start`. This is the name the model answers with. */
  id: string;
  title: string;
  /** One sentence saying what happens. */
  summary: string;
  /** The heading it is listed under, so a long list reads as a few short ones. */
  group: string;
  /** Where the same thing is on screen, for a person who would rather press it. */
  control: string;
  arguments: readonly AutomationStudioPanelCapabilityArgument[];
  /**
   * True only where performing it re-authorizes -- deleting something, or
   * completing a purchase or payment.
   *
   * It does not mean "ask permission". Core gates exactly two consequence
   * classes (`runtime/action-permissions/destructive.ts`), and everything else
   * the panel can do is ordinary work the person's own request already
   * authorised. A model must be able to see which two those are so it never
   * offers to ask about the rest.
   */
  reauthorizes: boolean;
};
