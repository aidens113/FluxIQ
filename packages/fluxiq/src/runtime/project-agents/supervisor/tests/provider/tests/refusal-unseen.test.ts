// t1093: a builder the model provider refused hands back the provider's refusal for the person's return card; the
// supervisor's view of that return carries none of it, since a provider fault is nothing the supervisor can act on.
// On a lending library's catalogue.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../../automation-activity/index.ts";
import { AUTOMATION_STUDIO_PROJECT_SUPERVISOR_TOOL_IDS as IDS } from "../../../index.ts";
import { planInput, project, subflow, taskSpecInput } from "../../supervisor-fixture.ts";
import { FIND, brief, call, dispatch, end, supervise } from "../../supervisor-script.ts";

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";
const REFUSAL = { status: 400, contentType: "application/json", bodyBytes: 210, error: { code: null, type: "invalid_request_error", param: null, message: GRAMMAR }, withheld: [], request: null };
const answersOf = (shown: ReadonlyArray<{ toolId: string; value: unknown }>, toolId: string) => shown.filter((entry) => entry.toolId === toolId).map((entry) => entry.value as JsonObject);

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

describe("a builder the model provider refused", () => {
  it("is shown to the supervisor with no refusal, and to the person with the provider's words", async () => {
    const plan = planInput([subflow("find_titles", ["p1"])], taskSpecInput([["p1", FIND, []]]));
    const built = project({ builder: () => "blocked", providerRefusal: () => REFUSAL });
    const run = await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => supervise([call(IDS.writePlan, plan), dispatch([brief("find_titles", ["p1"])]), end("blocked")], built));
    const answered = answersOf(run.shown, IDS.dispatch)[0]!;
    expect(answered.returns).toMatchObject([{ subflowKey: "find_titles", outcome: "blocked" }]);
    // Nothing the supervisor reads carries the record or its words.
    const supervisorSaw = JSON.stringify(run.shown);
    expect(supervisorSaw).not.toContain("providerRefusal");
    expect(supervisorSaw).not.toContain("compiled grammar");
    // The person's card is given the record (its words are `automation-activity/project/tests/return-words.test.ts`'s).
    const card = seen.find((event) => (event.detail?.project as { kind?: string } | undefined)?.kind === "return");
    expect(card).toBeDefined();
  });
});
