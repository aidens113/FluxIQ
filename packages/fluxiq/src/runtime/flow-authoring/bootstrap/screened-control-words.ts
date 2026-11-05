// Words that have passed the screen a permission question's control name needs.
//
// A later attempt asks before it has shown the gate anything, so the gate cannot name a control
// (`../../action-permission-requests/gate.ts`, `carriedName`). The attempt gives the gate each saved
// step's recorded words first (`./action-permissions.ts`, `shown`). Words are page text, and the
// screens live in `runtime/llm`, which this directory cannot import without a cycle, so the type
// says what the caller did: only a function that ran the secret and locator screens makes one, and
// `shown` accepts nothing else. The gate then still carries a name only if it is plain and bounded.

declare const SCREENED: unique symbol;

/** Control words a caller screened for a person to read; never a plain string. */
export type AutomationStudioFlowBootstrapScreenedControlWords = string & { readonly [SCREENED]: true };
