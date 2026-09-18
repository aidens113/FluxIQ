// A grant carries what a person allowed the run's actions to do, and that is
// how a person's answer to a permission request reaches the next run.

import { describe, expect, it } from "vitest";
import { issueInput, setupExecutionGrantFixture as setup } from "./execution-grant-fixture.ts";

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

  it("refuses to issue a grant naming a class Core does not recognise, and mints nothing", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    await expect(fixture.service.issue({ ...buildInput(), permittedConsequences: ["move_money", "purchase"] as never })).rejects.toThrow(/does not recognise/);
    await expect(fixture.service.preflight({ ...buildInput(), permittedConsequences: "delete" as never })).rejects.toThrow(/list/);
    expect(fixture.revealAuthorizationCount).toBe(0);
  });
});
