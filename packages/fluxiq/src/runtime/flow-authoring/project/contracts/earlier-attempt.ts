import type { AutomationStudioProjectEarlierAttempt } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";

const LIMITS = { reason: 2000, acts: 20, act: 200, did: 300 } as const;
const KINDS = Object.freeze(["build", "repair"] as const);

export const automationStudioProjectEarlierAttempt = Object.freeze({
  /** The earlier attempt as a brief carries it, every field bounded (header). */
  of(input: { briefId: string; kind: "build" | "repair"; reason: string; lastingActs: ReadonlyArray<{ act: string; did: string }> }): AutomationStudioProjectEarlierAttempt {
    return {
      briefId: input.briefId,
      kind: input.kind,
      reason: clipped(input.reason, LIMITS.reason),
      // Only acts the ledger names; one it names without saying what it did is said by its name, so the record reads it back.
      lastingActs: input.lastingActs.filter((entry) => entry.act.trim()).slice(-LIMITS.acts).map((entry) => ({ act: clipped(entry.act, LIMITS.act), did: clipped(entry.did.trim() ? entry.did : entry.act, LIMITS.did) }))
    };
  },

  /** An earlier attempt as a recorded brief holds it; throws a refusal for `shape.parse`. */
  read(value: unknown, path: string): AutomationStudioProjectEarlierAttempt {
    const fields = shape.object(value, path, ["briefId", "kind", "reason", "lastingActs"]);
    const lastingActs = shape.array(fields.lastingActs, `${path}.lastingActs`, LIMITS.acts).map((entry, index) => {
      const act = shape.object(entry, `${path}.lastingActs.${index}`, ["act", "did"]);
      return { act: shape.text(act.act, `${path}.lastingActs.${index}.act`, LIMITS.act), did: shape.text(act.did, `${path}.lastingActs.${index}.did`, LIMITS.did) };
    });
    return {
      briefId: shape.storageId(fields.briefId, `${path}.briefId`),
      kind: shape.oneOf(fields.kind, `${path}.kind`, KINDS),
      reason: shape.text(fields.reason, `${path}.reason`, LIMITS.reason),
      lastingActs
    };
  }
});

function clipped(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
