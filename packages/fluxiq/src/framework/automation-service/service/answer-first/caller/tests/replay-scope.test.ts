// A caller's scope over a saved Flow's own run: a plan with a step outside it does not run, and a
// step whose parameters resolve to an address off its sites is refused unsent, as a failed step that
// did nothing; what it grants goes through.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../../components/automation/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstReplayScope } from "../index.ts";

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Dispatcher = NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]>;

const success: AutomationNodeExecutionResult = { status: "success", route: "success", outputs: {}, effects: [] };

function engine() {
  const reached: string[] = [];
  const nativeNodeExecutor: Native = (async (request) => {
    reached.push(`node:${request.node.id}`);
    return { result: success };
  }) as Native;
  const effectDispatcher: Dispatcher = (async (effect) => {
    reached.push(`effect:${effect.type}`);
    return success;
  }) as Dispatcher;
  return { reached, options: { nativeNodeExecutor, effectDispatcher } as AutomationStudioGraphExecutionOptions };
}

const nodeCall = (id: string, parameterValues: JsonObject) => ({ node: { id, definitionId: "domain.web.go", parameterValues }, inputs: {} }) as unknown as Parameters<Native>[0];

describe("a caller's scope over a saved Flow's run", () => {
  it("absent, there is nothing to hold", () => {
    expect(automationStudioAnswerFirstReplayScope(undefined)).toBeUndefined();
  });

  it("refuses a plan with a step declaring a class it does not grant, or naming an address off its sites, in Core's words", () => {
    const scope = automationStudioAnswerFirstReplayScope({ permittedConsequences: ["create_new"], sites: ["library.example"] })!;
    expect(scope.refusal([{ consequences: [] }, { consequences: ["create_new"], parameters: { url: "https://shop.library.example/a" } }])).toBeUndefined();
    expect(scope.refusal([{ consequences: ["modify_existing", "create_new"] }, { consequences: ["modify_existing", "delete"] }])).toBe("A step of the saved Flow is an act this task may not do (modify_existing, delete), so the Flow did not run. Its steps are your draft: get the result without that act.");
    expect(scope.refusal([{ consequences: [], parameters: { go: { to: "https://elsewhere.example/loans" } } }])).toBe("A step of the saved Flow goes to elsewhere.example, outside the sites this task may use (library.example), so the Flow did not run. Its steps are your draft: get the result on those sites.");
    // A word that is no class is the permission gate's to read, and a place that is no web address is the domain's.
    expect(scope.refusal([{ consequences: ["nonsense"], parameters: { at: "library://account" } }])).toBeUndefined();
  });

  it("refuses unsent a step whose resolved parameters, or an output's, go off the sites, and lets the rest through", async () => {
    const { reached, options } = engine();
    const gated = automationStudioAnswerFirstReplayScope({ permittedConsequences: [], sites: ["library.example"] })!.gated(options);
    const off = await gated.nativeNodeExecutor!(nodeCall("n1", { url: "https://elsewhere.example/x" }));
    expect(off?.result).toMatchObject({ status: "failed", route: "failed", failure: { code: "answer_first.outside_scope", category: "blocked_by_capability_or_policy", retryable: false, effect: "unacted" } });
    expect(off?.result.message).toContain("elsewhere.example is outside the sites this task may use (library.example)");
    expect((await gated.nativeNodeExecutor!(nodeCall("n2", { url: "https://library.example/loans" })))?.result.status).toBe("success");
    const sent = await gated.effectDispatcher!({ type: "policy.output.dispatch", payload: { outputId: "web.go", parameters: { url: "https://elsewhere.example/" } } });
    expect(sent?.failure?.code).toBe("answer_first.outside_scope");
    await gated.effectDispatcher!({ type: "policy.output.dispatch", payload: { outputId: "web.go", parameters: { url: "https://library.example/" } } });
    expect(reached).toEqual(["node:n2", "effect:policy.output.dispatch"]);
  });

  it("with no sites named, the run's options are left as they were", () => {
    const { options } = engine();
    expect(automationStudioAnswerFirstReplayScope({ permittedConsequences: [] })!.gated(options)).toBe(options);
  });
});
