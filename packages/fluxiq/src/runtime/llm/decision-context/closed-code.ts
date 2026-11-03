// The one test every string on a history row passes.
//
// A closed code or identifier has no whitespace, so no sentence, no page text
// and no prose the model wrote can travel as one. The pattern is the one the
// evidence loop holds its own closed codes to (`../evidence-loop-decision.ts`).

const CLOSED_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/** The value when it is a closed code, and nothing when it is anything else. */
export function automationStudioLlmDecisionContextClosedCode(value: unknown): string | undefined {
  return typeof value === "string" && CLOSED_CODE.test(value) ? value : undefined;
}
