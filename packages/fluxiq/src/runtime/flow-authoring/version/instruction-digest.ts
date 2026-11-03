import { createHash } from "node:crypto";

/**
 * The digest of the question a verdict was reached about.
 *
 * "Worse" is only meaningful against the same question. A run confirmed under
 * one instruction and a run refuted under another prove nothing about each
 * other, so every judgement carries the digest of the request it was judged
 * against and no comparison may cross two digests.
 *
 * **It digests the instruction text and nothing else**, which is a deliberate
 * departure from `compiledPlan.provenance.instructionDigest`. That one is
 * `sha256` over the *resolved instruction objects*, ids, priorities, revisions
 * and timestamps included -- so re-ordering two instructions, or editing one
 * and leaving its words alone, would change the digest and silently sever a
 * Flow from its own confirmed history. The question a person asked did not
 * change, so the digest must not. Titles and bodies are trimmed and sorted, so
 * neither the order they are resolved in nor their priorities can move it.
 *
 * `null` where nothing was read. A verdict Core settles from its own arithmetic
 * -- every row refused, a required field with no value -- asks no model and
 * reads no instruction, and a Flow may simply have no instructions at all.
 * Digesting the empty set would give every such run one shared digest and make
 * unrelated Flows look like the same question, which is the one error worth
 * paying a `null` to avoid: a null digest matches nothing, so it compares to
 * nothing.
 */
export function automationStudioFlowInstructionDigest(
  instructions: readonly { title?: string; body?: string }[]
): string | null {
  const stated = instructions
    .map((instruction) => ({ title: (instruction.title ?? "").trim(), body: (instruction.body ?? "").trim() }))
    .filter((instruction) => instruction.title || instruction.body)
    .map((instruction) => `${instruction.title}\u0000${instruction.body}`)
    .sort();
  if (!stated.length) return null;
  return createHash("sha256").update(JSON.stringify(stated)).digest("hex");
}
