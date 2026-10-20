import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage } from "@fluxiq/contracts/client-gateway";
import { withoutClientGatewayTraceMetadata } from "../index.ts";

const envelope = { id: "m-1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1 };
const references = { artifacts: [], unavailable: 0 };

describe("withoutClientGatewayTraceMetadata", () => {
  it("takes metadata.trace off an action result and keeps the rest", () => {
    const message: ClientGatewayClientMessage = { ...envelope, type: "client.action_result", payload: { commandId: "c-1", status: "succeeded", metadata: { kept: true, trace: references } } };
    const stripped = withoutClientGatewayTraceMetadata(message);
    expect(stripped).toEqual({ ...envelope, type: "client.action_result", payload: { commandId: "c-1", status: "succeeded", metadata: { kept: true } } });
    expect(message.type === "client.action_result" ? message.payload.metadata : undefined).toEqual({ kept: true, trace: references });
  });

  it("drops metadata the trace was all of", () => {
    const message: ClientGatewayClientMessage = { ...envelope, type: "client.action_result", payload: { commandId: "c-1", status: "succeeded", metadata: { trace: references } } };
    expect(withoutClientGatewayTraceMetadata(message)).toEqual({ ...envelope, type: "client.action_result", payload: { commandId: "c-1", status: "succeeded" } });
  });

  it("takes it off a reconcile answer's landed result", () => {
    const message: ClientGatewayClientMessage = { ...envelope, type: "client.reconcile_result", payload: { commandId: "c-1", state: "landed", result: { commandId: "c-1", status: "succeeded", metadata: { trace: references } } } };
    expect(withoutClientGatewayTraceMetadata(message)).toEqual({ ...envelope, type: "client.reconcile_result", payload: { commandId: "c-1", state: "landed", result: { commandId: "c-1", status: "succeeded" } } });
  });

  it("returns any other message as the same object", () => {
    const result: ClientGatewayClientMessage = { ...envelope, type: "client.action_result", payload: { commandId: "c-1", status: "succeeded", metadata: { kept: true } } };
    const update: ClientGatewayClientMessage = { ...envelope, type: "client.state_update", payload: { metadata: { trace: references } } };
    expect(withoutClientGatewayTraceMetadata(result)).toBe(result);
    expect(withoutClientGatewayTraceMetadata(update)).toBe(update);
  });
});
