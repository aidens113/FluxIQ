// A client's answer to Core asking what became of one command, decided from
// what it knows, in order.

import { describe, expect, it } from "vitest";
import type { ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import { clientGatewayReconcileAnswer } from "../index.ts";

const kept: ClientGatewayActionResult = { commandId: "cmd-1", status: "succeeded", payload: { pressed: true } };

describe("clientGatewayReconcileAnswer", () => {
  it("answers running first, whatever else is known", () => {
    expect(clientGatewayReconcileAnswer("cmd-1", { running: true, result: kept, recordLeft: true, seen: true })).toEqual({ commandId: "cmd-1", state: "running" });
  });

  it("answers landed with the kept result", () => {
    expect(clientGatewayReconcileAnswer("cmd-1", { running: false, result: kept, recordLeft: false, seen: true })).toEqual({ commandId: "cmd-1", state: "landed", result: kept });
  });

  it("answers unknown for a record left or an id remembered", () => {
    expect(clientGatewayReconcileAnswer("cmd-1", { running: false, recordLeft: true, seen: false })).toEqual({ commandId: "cmd-1", state: "unknown" });
    expect(clientGatewayReconcileAnswer("cmd-1", { running: false, recordLeft: false, seen: true })).toEqual({ commandId: "cmd-1", state: "unknown" });
  });

  it("answers not_seen only when nothing at all is known", () => {
    expect(clientGatewayReconcileAnswer("cmd-1", { running: false, result: undefined, recordLeft: false, seen: false })).toEqual({ commandId: "cmd-1", state: "not_seen" });
  });
});
