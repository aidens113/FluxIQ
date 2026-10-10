// The host's answer about an act whose answer was lost, for a node that
// declares no expected state (t430): only `landed` and `not_landed` pass
// through; no method, a throw and any other answer are `unknown`.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioHostActLanding, AutomationStudioHostActLandedInput, AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import { automationStudioHostActLanded } from "../index.ts";

const NODE: AutomationStudioFlowNode = { id: "dismiss", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.press" } };
const INPUT = { node: NODE, attemptId: "dismiss.attempt.1", timeoutMs: 4_000 };

function host(actLanded?: AutomationStudioHostRuntimeBoundary["actLanded"]): AutomationStudioHostRuntimeBoundary {
  return { capabilities: [], ...(actLanded ? { actLanded } : {}) };
}

describe("asking the host whether an act landed", () => {
  it("passes the host's landed and not_landed through, with what it was asked", async () => {
    const asked: AutomationStudioHostActLandedInput[] = [];
    expect(await automationStudioHostActLanded(host((input) => {
      asked.push(input);
      return "landed";
    }), INPUT)).toBe("landed");
    expect(await automationStudioHostActLanded(host(async (): Promise<AutomationStudioHostActLanding> => "not_landed"), INPUT)).toBe("not_landed");
    expect(asked).toEqual([INPUT]);
  });

  it("is unknown with no host, no such method, a throw, or an answer that is not one of the three", async () => {
    expect(await automationStudioHostActLanded(undefined, INPUT)).toBe("unknown");
    expect(await automationStudioHostActLanded(host(), INPUT)).toBe("unknown");
    expect(await automationStudioHostActLanded(host(() => {
      throw new Error("page gone");
    }), INPUT)).toBe("unknown");
    expect(await automationStudioHostActLanded(host(async () => {
      throw new Error("page gone");
    }), INPUT)).toBe("unknown");
    // A host written outside TypeScript may answer anything at all.
    const offContract = host();
    Reflect.set(offContract, "actLanded", () => "landed?");
    expect(await automationStudioHostActLanded(offContract, INPUT)).toBe("unknown");
    expect(await automationStudioHostActLanded(host(() => "unknown"), INPUT)).toBe("unknown");
  });
});
