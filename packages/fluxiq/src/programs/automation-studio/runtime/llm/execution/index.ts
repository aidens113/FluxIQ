// A grant: what authorizes one run's LLM spend, what it says about itself, and
// the one answer it gives when it will not be claimed.
//
// These three shared the `execution-` prefix as flat files, which the structure
// audit reads as a directory that has not been made yet -- and it was right.
// They are one subject with three parts: the store that mints, holds and claims
// a grant; the metadata a caller may read off one; and the typed refusal a
// claim raises. A caller that only needs to read a refusal code no longer
// imports the whole service to do it.
export * from "./grant-checks.ts";
export * from "./grant-metadata.ts";
export * from "./grant-refusal.ts";
export * from "./grants.ts";
