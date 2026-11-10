// What the handler suites for the panel assistant's declarations share: an
// exposed endpoint's minimal valid example must pass its own input, and the
// handler must take it without a validation refusal.

import { expect } from "vitest";

import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../../../_shared/api.ts";

/** Every permission the Flow-authoring endpoints ask for. */
export const assistantTestActor: ProgramApiActor = {
  sessionId: "session.assistant",
  userId: "user.assistant",
  roleId: "admin",
  permissions: ["programs.read", "programs.write", "flows.write", "runtime.control"]
};

/** Calls `endpoint` with `example`; refuses if the declared input rejects it, or the handler answers not-ok. */
export async function expectExampleAccepted(registry: GlobalProgramApiRegistry, endpoint: string, example: Record<string, unknown>, extraPayload: Record<string, unknown> = {}): Promise<unknown> {
  const declared = registry.endpoints().find((entry) => entry.programId === "automation-studio" && entry.endpoint === endpoint)?.assistant;
  if (declared === undefined || "hidden" in declared) throw new Error(`${endpoint} is not exposed to the assistant.`);
  const read = declared.input.read(example);
  expect(read, `${endpoint} input`).toEqual({ ok: true, value: expect.anything() });
  const response = await registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: assistantTestActor, payload: { ...example, ...extraPayload, authSessionId: assistantTestActor.sessionId } });
  expect(response.ok, `${endpoint}: ${response.error ?? ""}`).toBe(true);
  return response.payload;
}
