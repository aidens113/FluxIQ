// Barrel for action permissions: the consequences an action can have, which of
// them are destructive enough that a person is still asked, the check a domain
// calls before taking one, the gate that answers it for a run, the record of
// what each action declared, the cross-check that holds those against the
// person's own instruction, and the request a run carries to a person when the
// answer was no; and the build's one instruction read, which also answers
// the route the person names, with the quote grounding both share.
export * from "./consequences.ts";
export * from "./cross-check.ts";
export * from "./declaration.ts";
export * from "./declared.ts";
export * from "./destructive.ts";
export * from "./gate.ts";
export * from "./instructed.ts";
export * from "./instruction-quote/index.ts";
export * from "./instruction-reading/index.ts";
export * from "./instruction-route/index.ts";
export * from "./request.ts";
