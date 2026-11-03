// What a request's words and a condition's words say, read apart from the rows:
// whether the request asks for every result it looks through
// (`every-result.ts`) and the words a condition tests by
// (`condition-words.ts`), which Core's computed facts hold the request's own
// words against (`../computed-facts/left-out-accounted.ts`), and the exclusion
// words a presence or text test leaves a row out by (`request-exclusion-test.ts`).
export * from "./condition-words.ts";
export * from "./every-result.ts";
export * from "./request-exclusion-test.ts";
