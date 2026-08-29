import { describe, expect, it, vi } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { applySubflowDirectoryAction, readSubflowDirectoryUrlState, routerReferencesForSubflow } from "./index";

describe("Subflows large-project behavior", () => {
  it("caps directory requests and resolves one target from thousands of routes", () => {
    const fixture = createLargeAutomationStudioProjectFixture();
    const target = fixture.subflows[0]!;
    const router = {
      status: "active",
      rules: fixture.subflows.map((subflow, index) => ({
        ruleId: `rule.${index}`, name: `Route ${index}`, order: index, status: "active",
        target: { kind: "subflow", subflowId: subflow.subflowId }
      })),
      fallback: { kind: "subflow", subflowId: target.subflowId }
    };
    expect(readSubflowDirectoryUrlState({ limit: 50, offset: 2000 })).toMatchObject({ limit: 50, offset: 2000 });
    expect(routerReferencesForSubflow(router, target.subflowId)).toHaveLength(2);
  });

  it("propagates permission failures from destructive directory commands", async () => {
    const api = { post: vi.fn().mockResolvedValue({ ok: false, error: "subflow.delete permission required" }) } as any;
    await expect(applySubflowDirectoryAction(api, "delete", { subflowId: "subflow.00000" })).resolves.toEqual({
      ok: false, error: "subflow.delete permission required"
    });
    expect(api.post).toHaveBeenCalledWith("delete-flow-subflow", expect.any(Object));
  });
});
