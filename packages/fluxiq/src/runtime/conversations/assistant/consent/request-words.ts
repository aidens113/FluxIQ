/**
 * The small words the consent check reads around a class verb. Every list errs
 * one way: a word missing from `lead` or `filler`, or a word wrongly on
 * `negation`, `doubt` or `question`, costs the person one press of Allow; the
 * other mistakes would let a call run that nobody asked for.
 */
export const PANEL_ASSISTANT_REQUEST_WORDS = Object.freeze({
  /** A word anywhere that says not to, or not this: the words are not read as asking. */
  negation: new Set(["not", "no", "never", "nothing", "neither", "nor", "dont", "don't", "doesnt", "doesn't", "didnt", "didn't", "cant", "can't", "cannot", "wont", "won't", "shouldnt", "shouldn't", "without", "stop", "keep", "except", "instead", "wait", "hold", "cancel", "undo", "avoid"]) as ReadonlySet<string>,
  /** A word anywhere that leaves the act to a condition or a choice the model would make. */
  doubt: new Set(["if", "unless", "whether", "maybe", "perhaps", "might", "possibly", "probably", "or", "otherwise", "should", "whichever", "whatever"]) as ReadonlySet<string>,
  /** First words of a question; one opens the words only as "can you", "could you", "would you" or "will you". */
  question: new Set(["what", "how", "why", "when", "where", "which", "who", "whom", "whose", "is", "are", "was", "were", "am", "do", "does", "did", "has", "have", "had", "can", "could", "may", "shall", "will", "would"]) as ReadonlySet<string>,
  /** Words a request may open with before its verb: "please", "can you", "I want you to", "go ahead and". */
  lead: new Set(["please", "kindly", "just", "now", "go", "ahead", "ok", "okay", "yes", "yeah", "so", "can", "could", "would", "will", "you", "i", "i'd", "want", "like", "need", "to", "let's", "lets", "us", "help", "me", "may", "right", "away", "first", "next", "finally", "also", "then"]) as ReadonlySet<string>,
  /** Words that start a new clause, so a verb right after them is said as a request. */
  clause: new Set(["and", "then", "but", "also"]) as ReadonlySet<string>,
  /** Words that may stand between a verb and what it names: "delete the Flow called X", "remove both X and Y". */
  filler: new Set(["the", "a", "an", "my", "our", "your", "called", "named", "both", "and", ","]) as ReadonlySet<string>,
  /** The words that point at what is selected. */
  deictic: new Set(["this", "these", "selected"]) as ReadonlySet<string>,
  /** Words after a named item that make the act about something else: "remove X from the list". */
  elsewhere: new Set(["from", "out", "off"]) as ReadonlySet<string>,
  /** What a person may call each kind of thing a call acts on, singular and plural. */
  kinds: new Set(["flow", "flows", "project", "projects", "step", "steps", "run", "runs", "dataset", "datasets", "table", "tables", "key", "keys", "recording", "recordings", "item", "items"]) as ReadonlySet<string>
});
