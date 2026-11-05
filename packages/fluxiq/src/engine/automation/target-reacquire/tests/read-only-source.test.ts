// Which steps a stale or rechecked target may be found again from: a step that only
// reads. A plain list read says so through its trusted floor, carrying no record output.

import { describe, expect, it } from "vitest";
import type { AutomationStudioResolvedActionEffect } from "../../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationStudioReacquireSourceReadOnly as readOnly } from "../read-only-source.ts";

const node = (extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode => ({ id: "read", definitionId: "domain.read", ...extra }) as AutomationStudioFlowNode;
const floor = (effectClass: AutomationStudioResolvedActionEffect["effectClass"]): AutomationStudioResolvedActionEffect => ({ effectClass, permissionConsequences: [] });

describe("a source that may be read again", () => {
  it("counts a plain read whose trusted floor only observes", () => {
    expect(readOnly(node(), floor("observe"))).toBe(true);
  });

  it("does not count a node that says nothing about itself", () => {
    expect(readOnly(node())).toBe(false);
  });

  it("does not count an observing floor on a step marked as acting, or one that declared a lasting consequence", () => {
    expect(readOnly(node({ metadata: { destructive: true } }), floor("observe"))).toBe(false);
    expect(readOnly(node({ metadata: { declaredConsequences: ["modify_existing"] } }), floor("observe"))).toBe(false);
  });

  it("does not count a floor that acts, whatever the step claims", () => {
    expect(readOnly(node({ parameterValues: { recordOutput: { datasetId: "rows" } } }), floor("commit"))).toBe(false);
  });
});
