// The recorded decisions as the rows the history shows, before any is folded.
//
// A run of the same decision answered the same way is one row carrying every
// iteration it was made at, not one row each: the recorded builds re-asked one
// request four and then seven times in a row, and eleven identical rows would
// say it no better than one row that lists eleven iterations. A row whose
// decision was first made earlier than its own first iteration says so with
// `sameAs`, which is how an answered request points back at the call it
// repeats.
//
// What a row is told at two lengths: `full`, with every closed detail the
// record holds, and `codes`, with the detail reduced to codes and positions.
// Every string on a row has passed `./closed-code.ts`; one that did not is
// shown as absent rather than shown.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextClosedCode } from "./closed-code.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";

/**
 * What a row is to the compression ladder: `plain`, a successful call nothing
 * refused, answered or repeated, which may be folded into a count; `refusal`,
 * a refused, answered, failed or unusable decision, which always keeps a row;
 * `other`, everything else, shown in full until the least form counts it.
 */
export type AutomationStudioLlmDecisionContextRole = "plain" | "refusal" | "other";

/** One row of the history before it is written out. */
export type AutomationStudioLlmDecisionContextGroup = {
  kind: string;
  /** Every iteration this row's decision was made at, oldest first. */
  at: number[];
  sameAs?: number;
  role: AutomationStudioLlmDecisionContextRole;
  /** The row's cells after `at` and `kind`, in field order. */
  cells: { toolId: string | null; actionId: string | null; callId: string | null; code: JsonValue; changed: string | null };
  detail: { full?: JsonObject; codes?: JsonObject };
  /** What two rows share when they are the same decision answered the same way, at each length. */
  identity: { full: string; codes: string };
};

/** One group per record, before consecutive identical ones are joined. */
export function automationStudioLlmDecisionContextGroup(record: AutomationStudioLlmDecisionContextRecord): AutomationStudioLlmDecisionContextGroup | undefined {
  const shape = shapeOf(record);
  if (!shape) return undefined;
  // A completion is the same row as another when it met the same answer over the
  // same draft (`./recorder.ts`): its result is prose the model rewords, so it is
  // not part of what makes two completions one.
  const key = record.decision.kind === "completion" ? "completion" : "signature" in record.decision ? record.decision.signature : `${record.decision.kind}@${record.iteration}`;
  const revision = record.decision.kind === "completion" ? record.decision.draftRevision : null;
  const identity = (detail?: JsonObject): string => JSON.stringify([shape.kind, key, revision, shape.role, shape.cells, detail ?? null]);
  return {
    kind: shape.kind,
    at: [record.iteration],
    ...(record.firstSeenAt !== undefined ? { sameAs: record.firstSeenAt } : {}),
    role: shape.role,
    cells: shape.cells,
    detail: shape.detail,
    identity: { full: identity(shape.detail.full), codes: identity(shape.detail.codes) }
  };
}

type Shape = Pick<AutomationStudioLlmDecisionContextGroup, "kind" | "role" | "cells" | "detail">;

function shapeOf(record: AutomationStudioLlmDecisionContextRecord): Shape | undefined {
  const decision = record.decision;
  const cells = (values: { [K in keyof Shape["cells"]]?: Shape["cells"][K] | undefined }): Shape["cells"] => ({
    toolId: closed(values.toolId),
    actionId: closed(values.actionId),
    callId: closed(values.callId),
    code: values.code ?? null,
    changed: values.changed ?? null
  });
  switch (decision.kind) {
    case "look":
      return { kind: decision.refused ? "look_refused" : "look", role: decision.refused ? "refusal" : "plain", cells: cells({ toolId: decision.toolId, callId: decision.callId, code: closed(decision.resultCode) }), detail: {} };
    case "call": {
      const role = decision.refused ? "refusal" : record.firstSeenAt === undefined ? "plain" : "other";
      return {
        kind: decision.refused ? "call_refused" : "call",
        role,
        cells: cells({ toolId: decision.toolId, actionId: decision.actionId, callId: decision.callId, code: closed(decision.resultCode), changed: decision.changed }),
        detail: {}
      };
    }
    case "call_failed":
      return { kind: "call_failed", role: "refusal", cells: cells({ toolId: decision.toolId, actionId: decision.actionId, callId: decision.callId, code: closed(decision.code) }), detail: {} };
    case "answered":
      // The call id is the call whose result answered it: the entry to read instead of asking again.
      return { kind: "answered", role: "refusal", cells: cells({ toolId: decision.toolId, actionId: decision.actionId, callId: decision.answeredByCallId, code: closed(decision.code) }), detail: {} };
    case "amendment": {
      const refused = decision.refusals.filter((item) => Number.isInteger(item.step));
      const rest: JsonObject = {
        ...(decision.withdrewChanged.length ? { withdrewChanged: decision.withdrewChanged.filter(Number.isInteger) } : {}),
        ...(decision.undoneTo !== undefined ? { undoneTo: decision.undoneTo } : {}),
        ...(decision.rerun !== undefined ? { rerun: decision.rerun } : {})
      };
      return {
        kind: "amendment",
        role: refused.length ? "refusal" : "other",
        cells: cells({ code: codes(refused.map((item) => item.reason), refused.length ? "refused" : "applied") }),
        detail: {
          full: { applied: decision.applied, ...(refused.length ? { refused: refused.map((item) => [item.step, closed(item.reason), item.repeated]) } : {}), ...rest },
          codes: { applied: decision.applied, ...(refused.length ? { refused: refused.map((item) => item.step) } : {}), ...rest }
        }
      };
    }
    case "completion": {
      const dryRunRefused = Array.isArray(decision.dryRun) && decision.dryRun.length > 0;
      const dryRun: JsonValue | undefined = Array.isArray(decision.dryRun)
        ? decision.dryRun.map((item) => [item.step, closed(item.status)])
        : decision.dryRun === "clean" || decision.dryRun === "reused_clean" ? decision.dryRun : undefined;
      const shown = dryRun === undefined ? {} : { dryRun };
      const refusalCodes = record.detail ? [record.detail.code, record.detail.refusal, ...(Array.isArray(record.detail.refusals) ? record.detail.refusals : [])] : [];
      const refusal = [...new Set(refusalCodes.flatMap((value) => closed(value) ?? []))];
      return {
        kind: "completion",
        role: !decision.accepted || dryRunRefused ? "refusal" : "other",
        cells: cells({ code: codes(decision.issueCodes, decision.accepted ? (dryRunRefused ? "dry_run_refused" : "accepted") : "refused") }),
        detail: {
          full: { ...(record.detail ? { feedback: record.detail } : {}), ...shown },
          codes: { ...(refusal.length ? { refusal } : {}), ...shown }
        }
      };
    }
    case "unusable":
      return { kind: "unusable", role: "refusal", cells: cells({ code: codes(decision.issueCodes, "unusable") }), detail: {} };
    case "redirect":
      // Not a decision: the history lists redirects beside its rows.
      return undefined;
  }
}

/** One code as itself, several sorted and unique, none as the fallback. */
function codes(values: readonly unknown[], fallback: string): JsonValue {
  const kept = [...new Set(values.flatMap((value) => closed(value) ?? []))].sort();
  if (!kept.length) return fallback;
  return kept.length === 1 ? kept[0]! : kept;
}

function closed(value: unknown): string | null {
  return automationStudioLlmDecisionContextClosedCode(value) ?? null;
}
