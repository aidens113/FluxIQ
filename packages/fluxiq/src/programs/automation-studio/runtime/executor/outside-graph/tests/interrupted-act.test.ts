// A lost command on a committing act, met while a build explores or tests its
// draft, goes through the caller's effect check like any uncertain act (C8):
// its record is a refusal (`retryable: false`), which is no longer read as a
// plain refusal that skips the check.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioDispatchWithNodeRetries, type AutomationStudioEffectCheckResult } from "../../index.ts";

type Answer = { ok: true } | { ok: false; failure: AutomationStudioFailureRecord };

const INTERRUPTED_COMMIT: AutomationStudioFailureRecord = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, stage: "execution", effect: "ambiguous" };
const press: AutomationStudioFlowNode = { id: "web.output.dom-click", definitionId: "web.output.dom-click" };

async function run(check: AutomationStudioEffectCheckResult | undefined) {
  const asked: number[] = [];
  let dispatched = 0;
  const outcome = await automationStudioDispatchWithNodeRetries<Answer>({
    node: press,
    dispatch: async () => {
      dispatched += 1;
      return dispatched === 1 ? { ok: false, failure: INTERRUPTED_COMMIT } : { ok: true };
    },
    read: (answer) => answer,
    ...(check ? {
      checkEffect: async (_answer: Answer, attempt: number) => {
        asked.push(attempt);
        return check;
      }
    } : {}),
    delay: async () => undefined,
    now: () => 0
  });
  return { outcome, asked, dispatched };
}

describe("a lost committing act outside a graph", () => {
  it("is checked, and settled as done when it landed", async () => {
    const { outcome, asked, dispatched } = await run("landed");
    expect(asked).toEqual([1]);
    expect(dispatched).toBe(1);
    expect(outcome.lastingAct).toBe("landed");
  });

  it("is made again when the check shows it did not land", async () => {
    const { outcome, dispatched } = await run("not_landed");
    expect(dispatched).toBe(2);
    expect(outcome.result).toEqual({ ok: true });
  });

  it("is not made again with no check to ask", async () => {
    const { outcome, dispatched } = await run(undefined);
    expect(dispatched).toBe(1);
    expect(outcome.lastingAct).toBe("uncertain");
  });
});
