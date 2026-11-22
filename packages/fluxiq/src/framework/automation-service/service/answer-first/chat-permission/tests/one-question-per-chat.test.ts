// One permission question per chat, never mid-build (t976, F21).
//
// Live run `run-mwounh32-24f9bc6b` (social-network-feed, delete-stranger-requests) asked about
// deleting at its first Delete press, 85 decisions into the build, and asked again before the
// next attempt's saved Flow ran, in the same chat. Each attempt here is what `../../attempt/
// run-attempt.ts` makes of one: a fresh gate told the chat's ground, the start step with what the
// chat's reading declared (`runtime/conversations/instructions/acts.ts`), the saved Flow's own check
// before it runs (attempts after the first), then presses mid-build. A build that does not start
// itself (legacy, candidate, project) starts from the same ground before its first call. One thread
// answers as scripted and counts what it was asked. No model is called: the classes are declared.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration, AutomationStudioActionPermissionVerdict } from "../../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../../../../runtime/automation-parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { automationStudioAnswerFirstChatPermissionGround, automationStudioAnswerFirstChatPermissionOf, automationStudioAnswerFirstChatRecoveryGround, automationStudioAnswerFirstPermissionAtStart, automationStudioAnswerFirstPermissionForBuild } from "../index.ts";
import { AutomationStudioActionPermissionGate } from "../../../../../../runtime/action-permission-requests/index.ts";

const INSTRUCTION = "Go through all of my friend requests and delete every request from someone I have no mutual friends with. Then give me a table of the removed requests.";
const DELETE: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Delete", kind: "button" }, verb: "press" };
const SEND: AutomationStudioActionDeclaration = { consequences: ["send_or_publish"], control: { name: "Send", kind: "button" }, verb: "press" };

type Answer = "grant" | "deny";

/** One chat: its thread and the service its attempts run in. */
function chat(answers: Answer[]) {
  const owner = {};
  const stores = { paths: { root: undefined }, flows: { flowDirectory: () => "" }, projects: { ensureProjectStructure: async () => undefined } };
  const asked: { askId: string; when: "start" | "mid-build"; missing: readonly string[] }[] = [];
  let phase: "start" | "mid-build" = "start";
  let reads = 0;
  const thread: AutomationStudioParkingPort = {
    open: (ask: AutomationStudioAsk) => {
      asked.push({ askId: ask.askId, when: phase, missing: ask.missing ?? [] });
    },
    awaitAnswer: async (ask) => {
      const kind = answers.shift();
      return kind === undefined ? undefined : ({ askId: ask.askId, answeredAt: 1, kind, value: null, actorId: "person" } satisfies AutomationStudioAskAnswer);
    }
  };
  let requests = 0;
  /** One gate on this chat's Flow, with the chat's ground for what the reading declared. */
  const gate = (declared: readonly string[] | undefined, verdicts: AutomationStudioActionPermissionVerdict[], ground = automationStudioAnswerFirstChatPermissionGround({ owner, stores, projectId: "project.one", flowId: "flow.requests", instructionText: INSTRUCTION, taskActs: declared })) => automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.requests"],
    newRequestId: () => `permission-request:${++requests}`,
    // Counted to show no start reads the instruction: the classes come from the chat's reading.
    deriveInstructed: async () => {
      reads += 1;
      return [];
    },
    ...ground,
    ask: { port: thread, timeoutMs: 1_000 },
    executeTool: async (call) => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      verdicts.push(verdict);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = async (permissions: ReturnType<typeof gate>, presses: readonly AutomationStudioActionDeclaration[]) => {
    phase = "mid-build";
    for (const [index, declaration] of presses.entries()) await permissions.executeTool({ callId: `call.${index}`, toolId: "core.run_node", value: { declaration } as unknown as JsonObject });
  };
  /** One attempt: the start, a saved Flow's check before it runs when there is one, then presses mid-build. */
  const attempt = async (steps: { declared?: readonly string[]; savedFlow?: AutomationStudioActionDeclaration[]; presses: AutomationStudioActionDeclaration[]; carriedOn?: boolean }) => {
    phase = "start";
    const verdicts: AutomationStudioActionPermissionVerdict[] = [];
    const permissions = gate(steps.declared, verdicts);
    const readsBefore = reads;
    await automationStudioAnswerFirstPermissionAtStart({ owner, stores, projectId: "project.one", flowId: "flow.requests", instructionText: INSTRUCTION, taskActs: steps.declared, permissions, carriedOn: steps.carriedOn === true });
    const readAtStart = reads - readsBefore;
    const flowChecks: AutomationStudioActionPermissionVerdict[] = [];
    for (const [index, step] of (steps.savedFlow ?? []).entries()) flowChecks.push(await permissions.planStep({ definitionId: "web.output.dom-click", ref: `main.step${index}` })(step));
    permissions.closeAsking();
    await press(permissions, steps.presses);
    return { verdicts, flowChecks, readAtStart };
  };
  return { attempt, gate, press, asked, owner, stores, held: () => automationStudioAnswerFirstChatPermissionOf(owner, stores).get("project.one", "flow.requests") };
}

describe("one permission question per chat", () => {
  it("asks once, at the first attempt's start, across three attempts, and never mid-build", async () => {
    const one = chat(["grant", "grant", "grant"]);
    const first = await one.attempt({ declared: ["delete", "create_new"], presses: [DELETE, DELETE, DELETE] });
    // Run again, and a later attempt at the same words: nothing declared, the chat's answer stands.
    const second = await one.attempt({ savedFlow: [DELETE], presses: [DELETE] });
    const again = await one.attempt({ declared: ["delete"], savedFlow: [DELETE, DELETE], presses: [DELETE] });
    expect(one.asked).toEqual([{ askId: "permission-request:1", when: "start", missing: ["delete"] }]);
    for (const run of [first, second, again]) expect(run.verdicts.every((verdict) => verdict.permitted)).toBe(true);
    expect([...second.flowChecks, ...again.flowChecks].every((verdict) => verdict.permitted)).toBe(true);
    // No start reads the instruction: the classes are the chat's reading's.
    expect([first.readAtStart, second.readAtStart, again.readAtStart]).toEqual([0, 0, 0]);
    expect(await one.held()).toMatchObject({ granted: ["delete"], declined: [], needs: [{ classes: ["delete"] }] });
  });

  it("holds a no for the whole chat: refused unasked in every later attempt and its saved Flow", async () => {
    const one = chat(["deny", "grant", "grant"]);
    const first = await one.attempt({ declared: ["delete"], presses: [DELETE] });
    const second = await one.attempt({ savedFlow: [DELETE], presses: [DELETE] });
    const again = await one.attempt({ declared: ["delete"], presses: [DELETE] });
    expect(one.asked).toHaveLength(1);
    for (const verdict of [...first.verdicts, ...second.flowChecks, ...second.verdicts, ...again.verdicts]) {
      expect(verdict).toEqual({ permitted: false, missing: ["delete"], requestId: "permission-request:1", declined: true });
    }
  });

  it("a class nobody foresaw is refused mid-build unasked, and asked about once when the task next starts", async () => {
    const one = chat(["grant", "grant", "grant"]);
    const first = await one.attempt({ declared: ["delete"], presses: [DELETE, SEND] });
    expect(first.verdicts[1]).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(one.asked).toEqual([{ askId: "permission-request:1", when: "start", missing: ["delete"] }]);
    const second = await one.attempt({ declared: ["delete"], presses: [DELETE, SEND] });
    expect(one.asked).toEqual([
      { askId: "permission-request:1", when: "start", missing: ["delete"] },
      { askId: "permission-request:2", when: "start", missing: ["send_or_publish"] }
    ]);
    expect(second.verdicts).toEqual([{ permitted: true }, { permitted: true }]);
    await one.attempt({ presses: [DELETE, SEND] });
    expect(one.asked).toHaveLength(2);
    expect(one.asked.every((ask) => ask.when === "start")).toBe(true);
  });

  it("a carried-on attempt is the same attempt going on: it asks nothing, even about what it never asked", async () => {
    const one = chat(["grant"]);
    const carried = await one.attempt({ declared: ["delete"], presses: [DELETE], carriedOn: true });
    expect(one.asked).toEqual([]);
    expect(carried.verdicts).toEqual([{ permitted: false, missing: ["delete"], requestId: null }]);
    // And the next attempt's start asks about it.
    await one.attempt({ presses: [DELETE] });
    expect(one.asked).toEqual([{ askId: "permission-request:1", when: "start", missing: ["delete"] }]);
  });
});

describe("a build that does not start itself", () => {
  it.each(["grant", "deny"] as const)("starts legacy, candidate and project work before model decisions, holding a %s across every gate", async (answer) => {
    const one = chat([answer, "grant"]);
    const ground = automationStudioAnswerFirstChatPermissionGround({ owner: one.owner, stores: one.stores, projectId: "project.one", flowId: "flow.requests", instructionText: INSTRUCTION, taskActs: ["delete"] });
    const verdicts: AutomationStudioActionPermissionVerdict[] = [];
    await automationStudioAnswerFirstPermissionForBuild(one.gate(["delete"], verdicts, ground), ground);
    expect(one.asked).toHaveLength(1);
    for (const _mode of ["legacy", "candidate", "project"]) await one.press(one.gate(["delete"], verdicts, ground), [DELETE]);
    expect(one.asked).toHaveLength(1);
    expect(verdicts.every((verdict) => verdict.permitted === (answer === "grant"))).toBe(true);
    if (answer === "deny") expect(verdicts.every((verdict) => !verdict.permitted && verdict.declined)).toBe(true);
  });

  it("asks the one question before its first call, and its other gates (a project build's briefs) ask nothing", async () => {
    const one = chat(["grant", "grant"]);
    const ground = automationStudioAnswerFirstChatPermissionGround({ owner: one.owner, stores: one.stores, projectId: "project.one", flowId: "flow.requests", instructionText: INSTRUCTION, taskActs: ["delete"] });
    const buildVerdicts: AutomationStudioActionPermissionVerdict[] = [];
    const briefVerdicts: AutomationStudioActionPermissionVerdict[] = [];
    const build = one.gate(["delete"], buildVerdicts, ground);
    const brief = one.gate(["delete"], briefVerdicts, ground);
    // Both start at once; the first asks, the brief waits for it and holds its answer.
    await Promise.all([one.press(build, [DELETE]), one.press(brief, [DELETE, SEND])]);
    // Asked before the first call reached the domain: its verdict is a grant, not a refusal.
    expect(one.asked).toHaveLength(1);
    expect(one.asked[0]).toMatchObject({ missing: ["delete"] });
    expect([...buildVerdicts, briefVerdicts[0]]).toEqual([{ permitted: true }, { permitted: true }]);
    expect(briefVerdicts[1]).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(build.request()).toBeUndefined();
    expect(brief.request()).toBeUndefined();
    expect(build.endedOnRequest()).toBeUndefined();
    expect(brief.endedOnRequest()).toBeUndefined();
  });
});

it("a repair retains the chat's refusal and records an uncovered class for the next start without asking", async () => {
  const one = chat(["deny", "grant"]);
  await one.attempt({ declared: ["delete"], presses: [] });
  const ground = await automationStudioAnswerFirstChatRecoveryGround({ owner: one.owner, stores: one.stores })("project.one", "flow.requests");
  const gate = new AutomationStudioActionPermissionGate({ stage: "recovery" });
  gate.holdAnswer(ground.held!);
  gate.closeAsking(ground.unforeseen);
  const check = gate.checkFor({ kind: "exploration_step", id: "repair.press", ref: "repair.1" });
  expect(await check(DELETE)).toMatchObject({ permitted: false, declined: true });
  expect(await check(SEND)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
  expect(gate.signal.aborted).toBe(false);
  expect(gate.request).toBeUndefined();
  expect(one.asked).toHaveLength(1);
  const next = await one.attempt({ presses: [DELETE, SEND] });
  expect(one.asked.map((ask) => ask.missing)).toEqual([["delete"], ["send_or_publish"]]);
  expect(next.verdicts[0]).toMatchObject({ permitted: false, declined: true });
  expect(next.verdicts[1]).toEqual({ permitted: true });
});
