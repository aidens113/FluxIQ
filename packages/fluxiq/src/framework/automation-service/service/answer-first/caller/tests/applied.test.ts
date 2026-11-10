// A caller's grant and person port in an attempt's input: the scope replaces what the request
// permitted and takes the gate's question away, and a sink takes the conversation's place.
import { describe, expect, it } from "vitest";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../../attempt/index.ts";
import { automationStudioAnswerFirstCallerApplied } from "../index.ts";

const conversation: AutomationStudioParkingPort = { open: () => undefined };
const signal = new AbortController().signal;

function input(caller: AutomationStudioAnswerFirstAttemptInput["caller"]): AutomationStudioAnswerFirstAttemptInput {
  return {
    caller,
    permissionGround: { permittedConsequences: ["modify_existing"], instructionIds: ["instruction.task"], ask: { port: conversation, timeoutMs: 1_000 } },
    personAsk: { port: conversation },
    cancellation: { signal: () => signal, tool: (execute: unknown) => execute, checkpoint: () => undefined },
    creation: { askPort: (port: AutomationStudioParkingPort) => ({ ...port, wrapped: true }) }
  } as unknown as AutomationStudioAnswerFirstAttemptInput;
}

const ask = { askId: "ask.1", kind: "person_needed", text: "Please clear the check." } as unknown as AutomationStudioAsk;

describe("a caller's options applied to an attempt", () => {
  it("absent, leave the input exactly as it was", () => {
    const given = input(undefined);
    expect(automationStudioAnswerFirstCallerApplied(given)).toBe(given);
  });

  it("a scope is the grant: its consequences replace the request's, and nothing is asked", () => {
    const applied = automationStudioAnswerFirstCallerApplied(input({ scope: { permittedConsequences: ["create_new"] } }));
    expect(applied.permissionGround.permittedConsequences).toEqual(["create_new"]);
    expect(applied.permissionGround.ask).toBeUndefined();
    expect(applied.personAsk?.port).toBe(conversation);
  });

  it("a sink takes every question, and its answer comes back by callback; with no scope it hears permission questions too", async () => {
    const raised: string[] = [];
    const applied = automationStudioAnswerFirstCallerApplied(input({ personAsk: { raised: (each) => { raised.push(each.askId); }, answer: async (each) => ({ askId: each.askId, answeredAt: 1, kind: "grant", value: null, actorId: null }) } }));
    await applied.personAsk?.port.open(ask);
    expect(raised).toEqual(["ask.1"]);
    expect(await applied.personAsk?.port.awaitAnswer?.(ask, {})).toMatchObject({ kind: "grant" });
    const permission = applied.permissionGround.ask;
    expect(permission).toMatchObject({ timeoutMs: 1_000, signal, port: { wrapped: true } });
    await permission?.port.open(ask);
    expect(raised).toEqual(["ask.1", "ask.1"]);
    expect(applied.permissionGround.permittedConsequences).toEqual(["modify_existing"]);
  });

  it("a sink with no answer only hears: the attempt has no wait in place, and waits for a person", () => {
    const applied = automationStudioAnswerFirstCallerApplied(input({ personAsk: { raised: () => undefined } }));
    expect(applied.personAsk?.port.awaitAnswer).toBeUndefined();
  });
});
