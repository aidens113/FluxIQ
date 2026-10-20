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

/** `personSaid` is the person's message that started the command, read through the host as a chat turn's words are. */
function run(id: string, handlers: Record<string, (payload: Record<string, unknown>) => AutomationStudioConversationCommandCallResult>, args: Record<string, unknown>, personSaid?: string) {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const port = {
    async call(endpoint: string, payload: Record<string, unknown>): Promise<AutomationStudioConversationCommandCallResult> {
      calls.push({ endpoint, payload });
      return handlers[endpoint]?.(payload) ?? { ok: false, error: `No fake for ${endpoint}.` };
    }
  };
  const person = personSaid === undefined ? {} : { host: { personWords: async () => ({ text: personSaid, saysWhatToDo: true }) }, answerTurnId: "turn.answer" };
  const context = { port, host: {}, projectId: "project.plain", conversationId: "conversation.plain", sessionId: "session.person", keyLocked: false, paired: false, ...person } as unknown as AutomationStudioConversationCommandContext;
  return { calls, outcome: AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get(id)!.run(context, args) };
}

describe("a failed build's stored answer", () => {
  it("says the run-mut6b2re-d0e475d1 refusal in plain words, with how far it got", async () => {
    // Started by the person's own message, which is what is saved (t349); since t519 an improvement needs it.
    const outcome = await run("flow.improve", { "save-flow-instruction": () => ({ ok: true }), "generate-flow-bootstrap-adaptation": () => BLANK_TARGET }, { flowId: "flow.kettle", change: "also pick Spain" }, "It should also pick Spain.").outcome;
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).not.toMatch(RAW);
    expect(outcome.error).not.toMatch(RAW);
    expect(outcome.summary).toBe("The build failed: FluxIQ could not tell which part of this Flow to build on, as it builds on a Flow with one main part. Before that I saved what should change as an instruction on the Flow.");
  });

  it("refuses an improvement with no person turn behind it before saving anything", async () => {
    const { calls, outcome } = run("flow.improve", { "save-flow-instruction": () => ({ ok: true }), "generate-flow-bootstrap-adaptation": () => BLANK_TARGET }, { flowId: "flow.kettle", change: "also pick Spain" });
    const refused = await outcome;
    expect(refused.status).toBe("failed");
    expect(refused.summary).not.toMatch(RAW);
    expect(calls.map((call) => call.endpoint)).not.toContain("save-flow-instruction");
  });

  // Crossborder `run-mv8c76i3-61b9ca89` ended partial and read "what the model wrote could not be used", its stage's words (t595).
  it("says a project build's supervisor ending for what it was, never by the stage it ended in", () => {
    const ended = (outcome: string) => automationStudioConversationCallCause("the build", {
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.post_provider_validation_failed).",
      payload: { diagnostic: { code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation", issueCodes: [`project.build_${outcome}`] } }
    });
    expect(ended("partial")).toBe("the build failed: FluxIQ stopped with the Flow only partly built");
    expect(ended("blocked")).toBe("the build failed: FluxIQ could not finish the Flow");
    expect(ended("partial")).not.toContain("what the model wrote");
    // The stage's words stay for a failure there that carries no ending of the supervisor's.
    expect(automationStudioConversationCallCause("the build", { ok: false, error: "x", payload: { diagnostic: { code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation" } } }))
      .toBe("the build failed: what the model wrote could not be used");
  });

  // Everything-store `run-mv8id5vg` (t601): its time limit stopped it, and the person read that the supervisor ended it.
  it("says a project build its time limit stopped as the time limit, ahead of the supervisor's ending", () => {
    const timed = (codes: string[]) => automationStudioConversationCallCause("the build", {
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.post_provider_validation_failed).",
      payload: { diagnostic: { code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation", issueCodes: codes } }
    });
    expect(timed(["project.build_time_limit", "project.build_blocked"])).toBe("the build failed: it reached its time limit before a whole test of the Flow passed");
    expect(timed(["project.build_time_limit", "project.build_partial"])).toBe("the build failed: it reached its time limit before a whole test of the Flow passed, with only part of the Flow built");
    expect(timed(["project.build_time_limit"])).toBe("the build failed: it reached its time limit before a whole test of the Flow passed");
    expect(timed(["project.build_time_limit", "project.build_blocked"])).not.toContain("supervisor");
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
    const outcome = await run("run.execute", { "run-runtime-session": () => ({ ok: true, payload: { runtimeSession: { runId: "run-muw60j7c-bb7c9a62", status: "failed" }, terminalReason: "core.result.does_not_answer_request", durableBehaviorChanged: false } }) }, { flowId: "flow.kettle" }).outcome;
    expect(outcome.status).toBe("failed");
    expect(outcome.summary).toBe("The run failed. This run did not keep a change for future runs.");
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

// t649 (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, 00048): the build's ending and its toast said the
// supervisor ended it and never why. Its screened reason (`endedBecause`) is said after.
describe("a supervisor's reason for ending a build", () => {
  it("is said after the supervisor's ending, and not beside a time limit", () => {
    const ended = (issueCodes: string[], endedBecause?: string) => automationStudioConversationCallCause("the build", {
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.post_provider_validation_failed).",
      payload: { diagnostic: { code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation", issueCodes, ...(endedBecause === undefined ? {} : { endedBecause }) } }
    });
    expect(ended(["project.build_blocked"], "The item can't be collected from this branch.")).toBe("the build failed: FluxIQ could not finish the Flow: the item can't be collected from this branch");
    expect(ended(["project.build_partial"], "FluxIQ could not reach the last page.")).toBe("the build failed: FluxIQ stopped with the Flow only partly built: FluxIQ could not reach the last page");
    expect(ended(["project.build_blocked"])).toBe("the build failed: FluxIQ could not finish the Flow");
    expect(ended(["project.build_time_limit", "project.build_blocked"], "The item can't be collected.")).toBe("the build failed: it reached its time limit before a whole test of the Flow passed");
  });

  // t741 B5, job-board `run-mvgo9wzn-fad4e050`: "... could not finish the Flow: i could not finish ...".
  it("never lower-cases the pronoun I or a word in capitals", () => {
    const ended = (endedBecause: string) => automationStudioConversationCallCause("the build", {
      ok: false,
      error: "Flow Bootstrap generation failed (flow_bootstrap.post_provider_validation_failed).",
      payload: { diagnostic: { code: "flow_bootstrap.post_provider_validation_failed", stage: "post_provider_validation", issueCodes: ["project.build_blocked"], endedBecause } }
    });
    expect(ended("I could not finish this.")).toBe("the build failed: FluxIQ could not finish the Flow: I could not finish this");
    expect(ended("I've found no way to the last page.")).toBe("the build failed: FluxIQ could not finish the Flow: I've found no way to the last page");
    expect(ended("URL changes broke the second page.")).toBe("the build failed: FluxIQ could not finish the Flow: URL changes broke the second page");
    expect(ended("It stopped on the second page.")).toBe("the build failed: FluxIQ could not finish the Flow: it stopped on the second page");
  });
});
