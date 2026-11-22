// The build's permission questions when a caller asks once at the start of a task (t976, F21).
//
// Live run `run-mwounh32-24f9bc6b` asked "delete?" at the build's first Delete press (step 0184,
// 85 decisions in). The user's rule is that a dangerous act asks only when a Flow or chat starts,
// never mid-Flow. These drive `automationStudioFlowBootstrapActionPermissions` through
// `askAtStart`, a stand-in domain, and a thread that answers as scripted.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration, AutomationStudioActionPermissionVerdict, AutomationStudioInstructedConsequence } from "../../../action-permission-requests/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../automation-parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import type { AutomationStudioFlowBootstrapPermissionHeard } from "../start-asking.ts";
import { automationStudioFlowBootstrapUnforeseenSaid } from "../unforeseen-said.ts";

const DIGEST = `sha256:${"0".repeat(64)}`;
const DELETE_ASKED: AutomationStudioInstructedConsequence[] = [{ consequence: "delete", instructionId: "instruction.requests", instructionDigest: DIGEST, quote: "delete every request" }];
const DELETE: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Delete", kind: "button" }, verb: "press" };
const SEND: AutomationStudioActionDeclaration = { consequences: ["send_or_publish"], control: { name: "Send", kind: "button" }, verb: "press" };

type Answer = "grant" | "deny" | undefined;

function build(options: { answers: Answer[]; instructed?: readonly AutomationStudioInstructedConsequence[] | Error; permitted?: readonly string[]; ask?: boolean; withSay?: boolean }) {
  const opened: AutomationStudioAsk[] = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask) => {
      const kind = options.answers.shift();
      return kind === undefined ? undefined : ({ askId: ask.askId, answeredAt: 1, kind, value: null, actorId: "person" } satisfies AutomationStudioAskAnswer);
    }
  };
  let reads = 0;
  const heard: AutomationStudioFlowBootstrapPermissionHeard[] = [];
  const unforeseen: AutomationStudioActionConsequence[][] = [];
  const said: string[] = [];
  const verdicts: AutomationStudioActionPermissionVerdict[] = [];
  let next = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: options.permitted ?? [],
    instructionIds: ["instruction.requests"],
    newRequestId: () => `permission-request:${++next}`,
    deriveInstructed: async () => {
      reads += 1;
      if (options.instructed instanceof Error) throw options.instructed;
      return options.instructed ?? [];
    },
    ...(options.ask === false ? {} : { ask: { port, timeoutMs: 1_000 } }),
    ...(options.withSay ? { say: async (text: string) => { said.push(text); } } : {}),
    heard: (answer) => { heard.push(answer); },
    unforeseen: (classes) => { unforeseen.push([...classes]); },
    executeTool: async (call) => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      verdicts.push(verdict);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = (callId: string, declaration: AutomationStudioActionDeclaration) =>
    permissions.executeTool({ callId, toolId: "example.press", value: { declaration } as unknown as JsonObject });
  return { permissions, opened, heard, unforeseen, said, verdicts, press, reads: () => reads };
}

describe("asking once when the task starts", () => {
  it.each(["grant", "deny"] as const)("concurrent calls wait for the same pending start %s", async (kind) => {
    let opened!: () => void;
    const question = new Promise<void>((resolve) => { opened = resolve; });
    let answer!: (value: "grant" | "deny") => void;
    const response = new Promise<"grant" | "deny">((resolve) => { answer = resolve; });
    let asks = 0;
    let calls = 0;
    const verdicts: AutomationStudioActionPermissionVerdict[] = [];
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: [],
      ask: { port: {
        open: () => {
          asks += 1;
          opened();
        },
        awaitAnswer: async (ask) => ({ askId: ask.askId, kind: await response, value: null, actorId: "person", answeredAt: 1 })
      }, timeoutMs: 1_000 },
      executeTool: async (call) => {
        calls += 1;
        const verdict = await call.permission!(DELETE);
        verdicts.push(verdict);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    const start = permissions.askAtStart({ classes: ["delete"], ask: true });
    await question;
    const duplicate = permissions.askAtStart({ classes: ["send_or_publish"], ask: true });
    const action = permissions.executeTool({ callId: "delete", toolId: "press", value: {} });
    let checked = false;
    const plan = permissions.planStep({ definitionId: "press", ref: "main.delete" })(DELETE).then((verdict) => {
      checked = true;
      return verdict;
    });
    await Promise.resolve();
    expect(calls).toBe(0);
    expect(checked).toBe(false);
    answer(kind);
    const [first, second, , verdict] = await Promise.all([start, duplicate, action, plan]);
    expect(first).toEqual(second);
    expect(asks).toBe(1);
    expect(verdict.permitted).toBe(kind === "grant");
    expect(verdicts[0]?.permitted).toBe(kind === "grant");
    expect(permissions.request()).toBeUndefined();
    expect(permissions.endedOnRequest()).toBeUndefined();
    expect(permissions.signal.aborted).toBe(false);
  });

  it("asks one question before anything acts, and a grant lets every delete go ahead unasked", async () => {
    const run = build({ answers: ["grant"], instructed: DELETE_ASKED });
    const start = await run.permissions.askAtStart({ classes: ["delete", "create_new"], ask: true });
    expect(start).toMatchObject({ classes: ["delete"], outcome: "granted", asked: { action: { id: "core.task_start" }, missing: ["delete"] } });
    expect(run.opened).toHaveLength(1);
    expect(run.opened[0]).toMatchObject({ kind: "permission", parks: true, missing: ["delete"], control: { name: null, kind: null } });
    expect(run.heard).toEqual([{ outcome: "granted", classes: ["delete"], requestId: "permission-request:1", taskStart: true }]);
    await run.press("call.delete.tom", DELETE);
    await run.press("call.delete.diego", DELETE);
    expect(await run.permissions.planStep({ definitionId: "example.press", ref: "main.delete" })(DELETE)).toEqual({ permitted: true });
    expect(run.verdicts).toEqual([{ permitted: true }, { permitted: true }]);
    expect(run.opened).toHaveLength(1);
    // No read is made for the start: the classes are what the chat's reading declared. The press's own read is the gate's, as before.
    expect(run.reads()).toBe(1);
  });

  it("never asks mid-build: once the first call went out, a class nobody foresaw is refused unasked, recorded and said once", async () => {
    const run = build({ answers: ["grant", "grant"], instructed: DELETE_ASKED, withSay: true });
    await run.permissions.askAtStart({ classes: ["delete"], ask: true });
    await run.press("call.delete", DELETE);
    await run.press("call.send", SEND);
    await run.press("call.send.again", SEND);
    // The plan step a completion check puts to the gate is mid-build too.
    const step = await run.permissions.planStep({ definitionId: "example.press", ref: "main.send" })(SEND);
    expect(run.opened).toHaveLength(1);
    expect(run.verdicts[1]).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(run.verdicts[2]).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(step).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(run.unforeseen).toEqual([["send_or_publish"]]);
    expect(run.said).toEqual([automationStudioFlowBootstrapUnforeseenSaid(["send_or_publish"])]);
    expect(run.permissions.request()).toBeUndefined();
    expect(run.permissions.endedOnRequest()).toBeUndefined();
    expect(run.permissions.signal.aborted).toBe(false);
  });

  it("closes after its one question: a later saved-Flow check cannot ask about another class", async () => {
    const run = build({ answers: ["grant", "grant"], instructed: DELETE_ASKED });
    await run.permissions.askAtStart({ classes: ["delete"], ask: true });
    expect(await run.permissions.planStep({ definitionId: "example.press", ref: "main.send" })(SEND)).toEqual({ permitted: false, missing: ["send_or_publish"], requestId: null });
    expect(run.opened).toHaveLength(1);
    expect(run.heard.map((answer) => answer.taskStart)).toEqual([true]);
    run.permissions.closeAsking();
    const other: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Pay", kind: "button" }, verb: "press" };
    expect(await run.permissions.planStep({ definitionId: "example.press", ref: "main.pay" })(other)).toEqual({ permitted: false, missing: ["move_money"], requestId: null });
    expect(run.opened).toHaveLength(1);
  });

  it("uses the chat's answer and the classes it kept: no read, no question", async () => {
    const run = build({ answers: [], instructed: DELETE_ASKED });
    const start = await run.permissions.askAtStart({ held: { granted: ["delete"], declined: [], requestId: null }, classes: ["delete"], ask: true });
    expect(start).toEqual({ classes: ["delete"] });
    expect(run.reads()).toBe(0);
    expect(run.opened).toHaveLength(0);
    await run.press("call.delete", DELETE);
    expect(run.verdicts).toEqual([{ permitted: true }]);
  });

  it("holds the chat's no: refused as declined on any control, never asked again", async () => {
    const run = build({ answers: ["grant"], instructed: DELETE_ASKED });
    await run.permissions.askAtStart({ held: { granted: [], declined: ["delete"], requestId: "permission-request:earlier" }, classes: ["delete"], ask: true });
    await run.press("call.delete", DELETE);
    expect(run.opened).toHaveLength(0);
    expect(run.verdicts).toEqual([{ permitted: false, missing: ["delete"], requestId: "permission-request:earlier", declined: true }]);
    expect(run.unforeseen).toEqual([]);
  });

  it("a held decline overrides an existing grant even when its request identifier is absent", async () => {
    const run = build({ answers: ["grant"], permitted: ["delete"] });
    await run.permissions.askAtStart({ held: { granted: ["delete"], declined: ["delete"], requestId: null }, classes: ["delete"], ask: true });
    await run.press("call.delete", DELETE);
    expect(run.opened).toEqual([]);
    expect(run.verdicts).toEqual([{ permitted: false, missing: ["delete"], requestId: null, declined: true }]);
  });

  it("a carried-on attempt holds the answer and asks nothing; with nobody to ask nothing is read", async () => {
    const carried = build({ answers: ["grant"], instructed: DELETE_ASKED });
    expect(await carried.permissions.askAtStart({ held: { granted: [], declined: [], requestId: null }, ask: false })).toEqual({ classes: undefined });
    await carried.press("call.delete", DELETE);
    expect(carried.opened).toHaveLength(0);
    expect(carried.reads()).toBe(1); // only the gate's own read at the press, as before
    expect(carried.verdicts).toEqual([{ permitted: false, missing: ["delete"], requestId: null }]);
    expect(carried.permissions.request()).toBeUndefined();
    expect(carried.permissions.endedOnRequest()).toBeUndefined();

    const nobody = build({ answers: [], instructed: DELETE_ASKED, ask: false });
    expect(await nobody.permissions.askAtStart({ classes: ["delete"], ask: true })).toEqual({ classes: ["delete"] });
    expect(nobody.reads()).toBe(0);
  });

  it("with no classes declared, the start asks nothing and makes no read", async () => {
    const run = build({ answers: [], instructed: new Error("provider down") });
    expect(await run.permissions.askAtStart({ ask: true })).toEqual({ classes: undefined });
    expect(run.opened).toHaveLength(0);
    expect(run.reads()).toBe(0);
  });

  it("a caller that never asks at the start keeps asking at the press, as before", async () => {
    const run = build({ answers: ["grant"], instructed: DELETE_ASKED });
    await run.press("call.delete", DELETE);
    expect(run.opened).toHaveLength(1);
    expect(run.opened[0]).toMatchObject({ control: { name: null } });
    expect(run.verdicts).toEqual([{ permitted: true }]);
  });
});
