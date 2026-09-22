// A grant carries what a person allowed the run's actions to do, and that is
// how a person's answer to a permission request reaches the next run.

import { describe, expect, it } from "vitest";
import { issueInput, resolveInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

function buildInput() {
  return { ...issueInput(), purpose: "build_and_adapt" as const, maxCalls: 3, maxUses: 3, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.3 };
}

describe("the permission set an execution grant carries", () => {
  it("permits nothing when the request names nothing", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    expect((await fixture.service.issue(buildInput())).permittedConsequences).toEqual([]);
    expect((await fixture.service.preflight(buildInput())).permittedConsequences).toEqual([]);
  });

  it("carries the classes a person allowed, in Core's order, from issue through inspection", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...buildInput(), permittedConsequences: ["modify_existing", "move_money", "modify_existing"] });

    expect(grant.permittedConsequences).toEqual(["move_money", "modify_existing"]);
    const inspected = await fixture.service.inspectAvailable({ grantId: grant.grantId, actorUserId: "user.one", actorSessionId: "session.one", projectId: "project.one", flowId: "flow.one", purpose: "build_and_adapt" });
    expect(inspected.permittedConsequences).toEqual(["move_money", "modify_existing"]);
    // The grant hands out a copy: changing what was returned changes nothing held.
    inspected.permittedConsequences.push("delete");
    expect((await fixture.service.inspectAvailable({ grantId: grant.grantId, actorUserId: "user.one", actorSessionId: "session.one", projectId: "project.one", flowId: "flow.one", purpose: "build_and_adapt" })).permittedConsequences).toEqual(["move_money", "modify_existing"]);
  });

  // The resolution is how the set reaches a run: a recovery builds its
  // permission gate from what the resolved grant hands it.
  it("hands the permitted set to the run that resolves the grant, as a copy", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "explore_and_adapt", maxCalls: 3, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.3, permittedConsequences: ["create_new", "send_or_publish"] });

    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "explore_and_adapt" });
    expect(resolved.permittedConsequences).toEqual(["send_or_publish", "create_new"]);
    resolved.permittedConsequences.push("delete");
    const stored = [...(fixture.service as unknown as { grants: Map<string, { permittedConsequences: string[] }> }).grants.values()][0];
    expect(stored?.permittedConsequences).toEqual(["send_or_publish", "create_new"]);
  });

  it("resolves to the empty set for a grant that permitted nothing", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "explore_and_adapt", maxCalls: 3, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.3 });

    expect((await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "explore_and_adapt" })).permittedConsequences).toEqual([]);
  });

  it("refuses to issue a grant naming a class Core does not recognise, and mints nothing", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    await expect(fixture.service.issue({ ...buildInput(), permittedConsequences: ["move_money", "purchase"] as never })).rejects.toThrow(/does not recognise/);
    await expect(fixture.service.preflight({ ...buildInput(), permittedConsequences: "delete" as never })).rejects.toThrow(/list/);
    expect(fixture.revealAuthorizationCount).toBe(0);
  });
});
