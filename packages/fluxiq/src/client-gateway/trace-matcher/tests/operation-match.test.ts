// P4b: the pure parts of strict matching -- the canonical operation, where two
// operations differ, the classification at the cursor, command-id translation
// and contract compatibility.

import { describe, expect, it } from "vitest";
import {
  clientGatewayTraceContractCompatibility,
  clientGatewayTraceOperationDifferences,
  matchClientGatewayTraceOperation,
  readClientGatewayTraceOperation,
  translateClientGatewayTraceCommandIds,
  type ClientGatewayTraceRecordedOperation
} from "../../index.ts";

function recorded(payload: Record<string, unknown>, sequence: number, redacted = false): ClientGatewayTraceRecordedOperation {
  return { ...readClientGatewayTraceOperation(payload), sequence, logicalMs: sequence, commandId: `cmd-${sequence}`, session: "session-1", redacted };
}

describe("strict operation matching", () => {
  it("reads an operation canonically and ignores everything outside action type, target and parameters", () => {
    const left = readClientGatewayTraceOperation({ actionType: "a", parameters: { b: 1, a: { d: 2, c: [3, 1] } }, commandId: "x", lease: { id: "l" }, timeoutMs: 5, metadata: { trace: {}, node: "n" } });
    const right = readClientGatewayTraceOperation({ parameters: { a: { c: [3, 1], d: 2 }, b: 1 }, actionType: "a", commandId: "y" });
    expect(left.key).toBe(right.key);
    expect(readClientGatewayTraceOperation({ actionType: "a", parameters: { a: [1, 3] } }).key).not.toBe(readClientGatewayTraceOperation({ actionType: "a", parameters: { a: [3, 1] } }).key);
  });

  it("names differing fields by path only", () => {
    const left = readClientGatewayTraceOperation({ actionType: "a", parameters: { q: "secret one", list: [1, 2] }, target: { ref: "x" } });
    const right = readClientGatewayTraceOperation({ actionType: "a", parameters: { q: "secret two", list: [1, 3], extra: true }, target: { ref: "x" } });
    expect(clientGatewayTraceOperationDifferences(left, right)).toEqual(["parameters.extra", "parameters.list.1", "parameters.q"]);
  });

  it("classifies at the cursor without consuming a later recorded operation", () => {
    const trace = [recorded({ actionType: "a", parameters: { n: 1 } }, 1), recorded({ actionType: "b" }, 2), recorded({ actionType: "c" }, 3, true)];
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "a", parameters: { n: 1 } }), 0, trace)).toMatchObject({ status: "matched", recorded: { sequence: 1 } });
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "a", parameters: { n: 2 } }), 0, trace)).toMatchObject({ status: "gap", reason: "argument_mismatch", fields: ["parameters.n"], recordedSequence: 1 });
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "b" }), 0, trace)).toMatchObject({ status: "gap", reason: "ambiguous_context" });
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "z" }), 1, trace)).toMatchObject({ status: "gap", reason: "missing_transition", cause: "mismatch" });
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "c" }), 2, trace)).toMatchObject({ status: "gap", reason: "redacted_input" });
    expect(matchClientGatewayTraceOperation(readClientGatewayTraceOperation({ actionType: "a" }), 3, trace)).toMatchObject({ status: "gap", reason: "missing_transition", cause: "past_recorded_end" });
  });

  it("translates every quoted occurrence of a recorded command id and nothing else", () => {
    const text = "{\"payload\":{\"commandId\":\"cmd-1\",\"result\":{\"commandId\":\"cmd-1\"},\"other\":\"cmd-10\",\"note\":\"cmd-1 done\"}}";
    expect(translateClientGatewayTraceCommandIds(text, new Map([["cmd-1", "new-7"]]))).toBe("{\"payload\":{\"commandId\":\"new-7\",\"result\":{\"commandId\":\"new-7\"},\"other\":\"cmd-10\",\"note\":\"cmd-1 done\"}}");
  });

  it("judges contract compatibility by the versions the reader speaks", () => {
    expect(clientGatewayTraceContractCompatibility({ protocol: "1", extra: "9" }, { protocol: "1" })).toEqual({ status: "compatible" });
    expect(clientGatewayTraceContractCompatibility({ protocol: "1" }, { protocol: "2", domain: "1" })).toMatchObject({
      status: "incompatible",
      contracts: [{ name: "domain", recordedVersion: null }, { name: "protocol", recordedVersion: "1" }]
    });
  });
});
