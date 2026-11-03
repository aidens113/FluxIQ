// The one reader every project-agent contract parses with.
//
// Everything a project agent hands another -- a task spec, a structure plan, a
// brief, a builder's return -- arrives as model output or as a file someone
// could have edited. So a parser reads own data properties of plain objects
// only, refuses a key it does not know, and answers with a code and the path of
// the first thing it refused, never with a best guess.

/** What a parser answers: the parsed value, or the first refusal and where it was. */
export type AutomationStudioProjectParse<T> =
  | { status: "valid"; value: T }
  | { status: "invalid"; code: string; path: string };
