// What an attempt got, as the shared result record, and its ending checked against it
// (plan D8, D9). `./result.ts` picks the kind and says why it always gives a record;
// `./ending.ts` says what may throw. `./preview.ts`, `./carried-acts.ts` and
// `./probe.ts` are the writer's own.

export { automationStudioAnswerFirstEnding } from "./ending.ts";
export { AutomationStudioAnswerFirstEndingError } from "./ending-error.ts";
export { automationStudioAnswerFirstResult, type AutomationStudioAnswerFirstResultInput } from "./result.ts";
