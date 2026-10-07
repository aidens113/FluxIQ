// What the thread keeps for a failed build or run is plain words (t276, item
// 4). Live run `run-muw60unq-591e23bd` (U1) opened on an earlier thread that
// read: "... stopped because the build failed: Flow Bootstrap generation
// failed (flow_bootstrap.blank_target_required) (pre_provider_validation:
// flow_bootstrap.blank_target_required). Before that I saved what should
// change as an instruction on the Flow." (run `run-mut6b2re-d0e475d1`). Live
// run `run-muw6144a-e56f945d` closed on a Flow named "... at least five
// mutua...", cut inside a word.
import { describe, expect, it } from "vitest";
import { automationStudioConversationModelProblem } from "../../instructions/index.ts";
import type { AutomationStudioConversationCommandCallResult, AutomationStudioConversationCommandContext } from "../command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "../catalog.ts";
import { automationStudioConversationCallCause, automationStudioConversationPlainCause } from "../progress.ts";

/** No code, no stage and no API heading a person was never meant to read. */
const RAW = /flow_bootstrap|pre_provider|Flow Bootstrap|[a-z]+_[a-z_]+\.[a-z_]+|\([a-z_.]+\)/u;

const BLANK_TARGET: AutomationStudioConversationCommandCallResult = {
  ok: false,
  error: "Flow Bootstrap generation failed (flow_bootstrap.blank_target_required).",
  payload: { diagnostic: { code: "flow_bootstrap.blank_target_required", stage: "pre_provider_validation" } }
};

function run(id: string, handlers: Record<string, (payload: Record<string, unknown>) => AutomationStudioConversationCommandCallResult>, args: Record<string, unknown>) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const port = {
    async call(endpoint: string, payload: Record<string, unknown>): Promise<AutomationStudioConversationCommandCallResult> {
      calls.push({ endpoint, payload });
      return handlers[endpoint]?.(payload) ?? { ok: false, error: `No fake for ${endpoint}.` };
    }
  };
  const context = { port, host: {}, projectId: "project.plain", conversationId: "conversation.plain", sessionId: "session.person", keyLocked: false, paired: false } as unknown as AutomationStudioConversationCommandContext;
  return { calls, outcome: AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get(id)!.run(context, args) };
}

describe("a failed build's stored answer", () => {
  it("says the run-mut6b2re-d0e475d1 refusal in plain words, with how far it got", async () => {
    const outcome = await run("flow.improve", { "save-flow-instruction": () => ({ ok: true }), "generate-flow-bootstrap-adaptation": () => BLANK_TARGET }, { flowId: "flow.kettle", change: "also pick Spain" }).outcome;
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).not.toMatch(RAW);
    expect(outcome.error).not.toMatch(RAW);
    // Run with no person turn behind it, so the words saved are the argument's, and it says so (t349).
    expect(outcome.summary).toBe('"Improve a Flow that already has steps" stopped because the build failed: FluxIQ could not tell which part of this Flow to build on, as it builds on a Flow with one main part. Before that I saved what should change as an instruction on the Flow, as the request worded it, since no message of yours came with it.');
  });

  it("says a code with no words of its own by its stage, and one with neither as something that went wrong", () => {
    expect(automationStudioConversationCallCause("the build", { ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.bootstrap_context_failed).", payload: { diagnostic: { code: "flow_bootstrap.bootstrap_context_failed", stage: "pre_provider_validation" } } }))
      .toBe("the build failed: FluxIQ could not set the build up");
    expect(automationStudioConversationCallCause("the build", { ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." }))
      .toBe("the build failed: something went wrong inside FluxIQ");
    expect(automationStudioConversationCallCause("saving what it should do", { ok: false, error: "The Flow was not found." }))
      .toBe("saving what it should do failed: The Flow was not found");
  });

  it("leaves a code and its stage out of any cause", () => {
    expect(automationStudioConversationPlainCause("the build failed: Flow Bootstrap generation failed (flow_bootstrap.blank_target_required) (pre_provider_validation: flow_bootstrap.blank_target_required)"))
      .toBe("the build failed");
    expect(automationStudioConversationPlainCause("it stopped at llm_evidence_loop.repeat_refused")).toBe("");
    expect(automationStudioConversationPlainCause("The price on shop.example never appeared.")).toBe("The price on shop.example never appeared");
  });

  it("never says a model call's code", () => {
    expect(automationStudioConversationModelProblem(Object.assign(new Error("x"), { code: "llm.provider_refused_unknown" }))).toBe("the model call failed");
  });
});

describe("a failed run's stored answer", () => {
  it("names no run id and no code", async () => {
    const outcome = await run("run.execute", { "run-runtime-session": () => ({ ok: true, payload: { runtimeSession: { runId: "run-muw60j7c-bb7c9a62", status: "failed" }, terminalReason: "core.result.does_not_answer_request" } }) }, { flowId: "flow.kettle" }).outcome;
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("The run failed.");
    expect(outcome.runId).toBe("run-muw60j7c-bb7c9a62");
  });
});

describe("a new Flow's name", () => {
  it("is cut after a whole word, never inside one (run-muw6144a-e56f945d)", async () => {
    const instruction = "Go through my friend requests and confirm everyone I have at least five mutual friends with, then list who is accepted";
    const { calls, outcome } = run("flow.createHere", { "create-flow": () => ({ ok: false, error: "stop here" }) }, { instruction });
    await outcome;
    const name = calls.find((call) => call.endpoint === "create-flow")?.payload.name as string;
    expect(name).toBe("Go through my friend requests and confirm everyone I have at least five...");
    expect(name.length).toBeLessThanOrEqual(80);
  });
});
