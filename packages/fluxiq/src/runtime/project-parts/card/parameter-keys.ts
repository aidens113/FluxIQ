/**
 * The parameter keys that carry what a step types or chooses. A literal under one
 * is a value the part holds fixed; a binding under one is an input and is not.
 */
export const PART_VALUE_KEYS: ReadonlySet<string> = new Set(["value", "values", "text", "option", "options", "query", "keys", "key", "content"]);

/** A parameter key that names a credential: a literal under it is never stored, wherever it sits. */
export const PART_SECRET_KEY = /pass(?:word|code)?|secret|token|credential|api[-_]?key|cvv|cvc|ssn|card[-_]?number/iu;

/**
 * The parameter keys that name the control a step acts on when the domain says
 * none (`controlParameterKeys` in its implementation bundle, as the checked
 * rerun reads them). What they hold is the domain's evidence, which Core carries
 * and does not read.
 */
export const PART_DEFAULT_CONTROL_KEYS: readonly string[] = ["target"];

/** What a part's derivation asks of the domain about a step's control: which parameters name it, and the words a person would call it by. */
export type AutomationStudioPartControlReading = {
  controlKeys: ReadonlySet<string>;
  targetWords: (target: Record<string, unknown>) => readonly string[];
};
