// Coverage of agent.ts: the author of an event is read only in the contract's
// shape -- a closed role, an id-shaped brief id, a non-blank subflow name.

import { expect, test } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityAgent } from "../agent.ts";

function event(agent: unknown): ClientGatewayActivity {
  return {
    activityId: "build-1",
    sequence: 1,
    subject: { kind: "build", id: "build-1", projectId: "p" },
    phase: "building",
    label: "Working",
    at: "2026-10-13T12:00:00.000Z",
    ...(agent === undefined ? {} : { agent: agent as NonNullable<ClientGatewayActivity["agent"]> })
  };
}

test("each role in the contract is read, with its brief and subflow", () => {
  expect(activityAgent(event({ role: "builder", briefId: "brief-1", subflowName: "  Search  " }))).toStrictEqual({ role: "builder", briefId: "brief-1", subflowName: "Search" });
  for (const role of ["supervisor", "builder", "repair", "validator"]) expect(activityAgent(event({ role }))?.role).toBe(role);
});

test("no agent, an unknown role or a malformed field is read as no author, or without that field", () => {
  expect(activityAgent(event(undefined))).toBe(undefined);
  expect(activityAgent(event(null))).toBe(undefined);
  expect(activityAgent(event("builder"))).toBe(undefined);
  expect(activityAgent(event({ role: "planner" }))).toBe(undefined);
  expect(activityAgent(event({ role: "constructor" })), "a name inherited from Object is no role").toBe(undefined);
  expect(activityAgent(event({ role: "builder", briefId: "a brief with spaces", subflowName: "   " }))).toStrictEqual({ role: "builder" });
  expect(activityAgent(event({ role: "repair", briefId: 7, subflowName: 3 }))).toStrictEqual({ role: "repair" });
  expect(activityAgent(event({ role: "builder", briefId: "x".repeat(201) }))).toStrictEqual({ role: "builder" });
});
