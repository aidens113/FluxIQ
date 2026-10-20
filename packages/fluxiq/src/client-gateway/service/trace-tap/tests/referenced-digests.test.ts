import { describe, expect, it } from "vitest";
import { clientGatewayTraceReferencedDigests } from "../index.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

function references(...sha256s: unknown[]): { artifacts: unknown[]; unavailable: number } {
  return { artifacts: sha256s.map((sha256) => ({ sha256, mediaType: "text/html", byteLength: 1, role: "primary" })), unavailable: 0 };
}

describe("clientGatewayTraceReferencedDigests", () => {
  it("reads the digests an action result references, once each, in order", () => {
    const message = { type: "client.action_result", payload: { commandId: "c-1", status: "succeeded", metadata: { trace: references(B, A, B) } } };
    expect(clientGatewayTraceReferencedDigests(message)).toEqual([B, A]);
  });

  it("reads them from a reconcile answer's landed result", () => {
    const message = { type: "client.reconcile_result", payload: { commandId: "c-1", state: "landed", result: { commandId: "c-1", status: "succeeded", metadata: { trace: references(A) } } } };
    expect(clientGatewayTraceReferencedDigests(message)).toEqual([A]);
  });

  it("ignores a digest that is not lower-case hex SHA-256, and a reference that is not an object", () => {
    const trace = references(A, A.toUpperCase(), "abc", 12, null, `${A}0`);
    const message = { type: "client.action_result", payload: { metadata: { trace: { ...trace, artifacts: [...trace.artifacts, "loose", null] } } } };
    expect(clientGatewayTraceReferencedDigests(message)).toEqual([A]);
  });

  it("reads none from any other message, or from a result without well-formed trace metadata", () => {
    expect(clientGatewayTraceReferencedDigests({ type: "client.state_update", payload: { metadata: { trace: references(A) } } })).toEqual([]);
    expect(clientGatewayTraceReferencedDigests({ type: "client.action_result", payload: { metadata: { trace: { artifacts: "none" } } } })).toEqual([]);
    expect(clientGatewayTraceReferencedDigests({ type: "client.action_result", payload: { metadata: { other: true } } })).toEqual([]);
    expect(clientGatewayTraceReferencedDigests({ type: "client.reconcile_result", payload: { commandId: "c-1", state: "not_seen" } })).toEqual([]);
    expect(clientGatewayTraceReferencedDigests(undefined)).toEqual([]);
    expect(clientGatewayTraceReferencedDigests("text")).toEqual([]);
  });
});
