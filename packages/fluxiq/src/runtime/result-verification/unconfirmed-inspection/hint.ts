import { AsyncLocalStorage } from "node:async_hooks";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";

type Hint = NonNullable<AutomationStudioResultVerification["unconfirmedInspection"]>;
type Scope = { round: number; flowSignature: string; replaySignature: string };
type Issued = { hint: Hint; summary: AutomationStudioRunResultSummary; snapshot: string; scope: Scope };
const current = new AsyncLocalStorage<Scope>();
const issued = new WeakMap<object, Issued>();

function known(hint: unknown): Issued | undefined {
  if (hint === null || typeof hint !== "object") return undefined;
  const found = issued.get(hint);
  return found && JSON.stringify(found.summary) === found.snapshot ? found : undefined;
}

/** Private build-only provenance: never exported through the agreement/public barrels. */
export const automationStudioResultUnconfirmedInspection = {
  during<T>(scope: Scope, work: () => Promise<T>): Promise<T> {
    return current.run(Object.freeze({ ...scope }), work);
  },
  issue(input: {
    summary: AutomationStudioRunResultSummary;
    /** Only the exact typed missing-cell result of the caller's locator, never raw model defects. */
    calls: ReadonlyArray<{ call: 1 | 2; unmeasured: readonly AutomationStudioLlmVerificationDefect[] }>;
  }): Hint | undefined {
    const scope = current.getStore();
    if (!scope || !input.summary.buildTest || input.summary.buildTest.test === "not_run") return undefined;
    const claims = input.calls.flatMap(({ call, unmeasured }) => unmeasured.flatMap((defect) => defect.kind === "asked_missing" && defect.column && defect.value !== undefined ? [Object.freeze({ call, row: defect.row, column: defect.column, claimedValue: defect.value, requestWords: defect.requestWords, ...(defect.step ? { claimedStep: defect.step } : {}) })] : []));
    if (!claims.length) return undefined;
    const hint: Hint = Object.freeze({ status: "unconfirmed", reason: "row_cell_unmeasured", requiresFreshRead: true, claims: Object.freeze(claims) });
    issued.set(hint, { hint, summary: input.summary, snapshot: JSON.stringify(input.summary), scope });
    return hint;
  },
  forSummary(hint: unknown, summary: AutomationStudioRunResultSummary): Hint | undefined {
    const found = known(hint);
    return found && found.summary === summary && found.scope === current.getStore() ? found.hint : undefined;
  },
  forCurrent(hint: unknown): Hint | undefined {
    const found = known(hint);
    return found && found.scope === current.getStore() ? found.hint : undefined;
  },
  forRound(hint: unknown, context: { round: number; flowSignature?: string; replaySignature?: string }): Hint | undefined {
    const found = known(hint);
    if (!found || found.scope.round !== context.round || (context.flowSignature === undefined && context.replaySignature === undefined)) return undefined;
    if (context.flowSignature !== undefined && found.scope.flowSignature !== context.flowSignature) return undefined;
    if (context.replaySignature !== undefined && found.scope.replaySignature !== context.replaySignature) return undefined;
    return found.hint;
  },
  value(hint: Hint): JsonObject {
    return {
      status: hint.status, reason: hint.reason, requiresFreshRead: true,
      instruction: "These are unconfirmed allegations, not findings. Inspect the current read and its excluded item, then freshly read the named column from the step's starting state before deciding whether a change is needed. Do not remove a condition or assume a claimed value from this hint alone. It grants no permission for an act and cannot establish completion; the repaired Flow still needs its normal test and judge.",
      claims: hint.claims.map((claim) => ({ ...claim }))
    };
  }
};
