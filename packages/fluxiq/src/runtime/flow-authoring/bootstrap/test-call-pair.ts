// The revision and digest a test call names, which are optional (K7): both left
// out is the latest proposal, a pair is held to being the latest as it always
// was, and only one of the two is refused with the instruction below. Shared by
// the whole-candidate test (`./candidate/trial-gate.ts`) and the subflow test
// (`./subflow-candidate/test-input.ts`), whose tools say the same in the same
// generic words.

/** What the two fields of a test call add up to. `malformed`: a field of the wrong type, left to the caller's own invalid answer. */
export type AutomationStudioCandidateTestPair =
  | { kind: "latest" }
  | { kind: "pair"; revision: number; digest: string }
  | { kind: "half"; instruction: string }
  | { kind: "malformed" };

const HALF = "Give both revision and digest, exactly as the submission returned them, or leave both out to test your latest submission. One without the other cannot be tested.";

/** The pair `revision` and `digest` make, as sent. */
export function automationStudioCandidateTestPair(revision: unknown, digest: unknown): AutomationStudioCandidateTestPair {
  if (revision === undefined && digest === undefined) return { kind: "latest" };
  if (revision === undefined || digest === undefined) return { kind: "half", instruction: HALF };
  if (!Number.isSafeInteger(revision) || typeof digest !== "string") return { kind: "malformed" };
  return { kind: "pair", revision: revision as number, digest };
}
