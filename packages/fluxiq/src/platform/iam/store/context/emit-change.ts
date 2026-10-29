import type { IamAuditSink } from "../../types.ts";
import type { IamChangeContext } from "./change-context.ts";

/**
 * Records one `iam-change` audit record for a mutation that succeeded.
 * `action` is `iam:<PascalCaseVerb>`; `resources` are the FRNs it changed.
 */
export function emitIamChange(
  sink: IamAuditSink | undefined,
  nowMs: number,
  context: IamChangeContext,
  action: string,
  resources: readonly string[]
): void {
  if (sink === undefined) return;
  sink.record({
    category: "iam-change",
    time: Math.floor(nowMs / 1000),
    requestId: context.requestId,
    principal: context.actor,
    action,
    resources,
    decision: "allow",
    matched: context.matched ?? { policy: "store", sid: null },
    origin: context.origin,
    ipPrefix: context.ipPrefix ?? null
  });
}
