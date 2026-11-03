import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";

// What a build or repair brief carries of the earlier brief of its subflow whose
// builder Core's no-progress guard stopped for repeating calls that made no
// progress (live lane 1 fix 1, `run-mvcx8na6-9554a3f1`). That builder never
// submitted, so nothing could be repaired, and the supervisor's second brief
// was refused as one "its builder could only do the same". A builder stopped for
// repeating itself is the model's variance, not a brief that can only do the
// same: a fresh builder told what the last one tried can take another path. Core
// sets it (`../supervisor/dispatch-tool.ts`), never the supervisor
// (`../supervisor/brief-input.ts`), and the dispatcher shows it to the new
// builder (`../dispatch/run-brief.ts`).
//
// `reason` is the earlier return's own, which names the guard's codes and the
// calls it stopped on, latest first, by tool, node and result code
// (`../dispatch/ending.ts`): Core keeps no other account of that builder's
// decisions, and nothing the model wrote. `lastingActs` are the acts it made
// that the build's ledger still holds on the target, by the ledger's names.

export type AutomationStudioProjectEarlierAttempt = {
  briefId: string;
  kind: "build" | "repair";
  reason: string;
  lastingActs: Array<{ act: string; did: string }>;
};

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
