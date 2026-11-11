import { describe, expect, it } from "vitest";
import { projectRuntimeSnapshot } from "..";

const empty = () => ({ runtimeId: "runtime.one", clients: [], adapters: [], transports: [], capabilities: [], runs: [], commandAttempts: [] });

describe("Runtime structural display projection", () => {
  it("rejects missing inventory arrays, unknown enum records and malformed identities", () => {
    expect(projectRuntimeSnapshot({ runtimeId: "runtime.one" })).toBeNull();
    expect(projectRuntimeSnapshot({ ...empty(), clients: [{ clientId: "one", status: "secret-state", transport: "direct" }] })).toBeNull();
    expect(projectRuntimeSnapshot({ ...empty(), runs: [{ runId: "bad\nidentity", targetKind: "flow", targetId: "flow.one", status: "running" }] })).toBeNull();
    expect(projectRuntimeSnapshot({ ...empty(), runtimeId: "x".repeat(201) })).toBeNull();
    expect(projectRuntimeSnapshot(empty())).not.toBeNull();
  });

  it("projects dispatch structure without retaining arbitrary sensitive fields", () => {
    const secret = "synthetic-password https://private.invalid/page page text";
    const projected = projectRuntimeSnapshot({ ...empty(),
      clients: [{ clientId: "client.one", label: "Registered client", status: "ready", transport: "websocket", metadata: { secret } }],
      capabilities: [{ id: "cap.one", kind: "action", metadata: { secret }, unknown: secret }],
      runs: [{ runId: "run.one", targetKind: "flow", targetId: "flow.one", status: "running", queuedAt: 1, metadata: { secret }, traceRef: secret }],
      commandAttempts: [{ attemptId: "attempt.one", commandId: "command.one", runId: "run.one", status: "failed", dispatchedAt: 2, transport: "websocket", clientId: "client.one", sessionId: "session.one", message: secret,
        command: { commandId: "command.one", kind: "execute_action", outputId: "output.one", parameters: { secret }, metadata: { secret }, target: { secret } },
        result: { payload: { secret }, message: secret, error: secret, failure: { expected: secret, actual: secret }, metadata: { secret } } }]
    });
    expect(projected).not.toBeNull();
    expect(JSON.stringify(projected)).not.toContain(secret);
    expect(projected!.dispatch[0]!.values).toContainEqual(["Client", "client.one"]);
    expect(projected!.dispatch[0]!.values).toContainEqual(["Output", "output.one"]);
    expect(projected!.dispatch[0]!.runId).toBe("run.one");
  });

  it("keeps sessions/origins distinct, bounds nested ids and sorts recorded runs by time", () => {
    const projected = projectRuntimeSnapshot({ ...empty(),
      clients: ["one", "two"].map((sessionId) => ({ clientId: "shared", sessionId, label: "Client", transport: "websocket", status: "ready" })),
      capabilities: [{ id: "cap", kind: "action", inputIds: Array.from({ length: 25 }, (_, index) => "input." + index) }, { id: "cap", kind: "action" }],
      adapters: [{ adapterId: "direct", label: "Native", transport: "native", capabilities: [] }],
      transports: [{ transportId: "gateway", label: "Gateway", kind: "websocket", clients: [] }],
      runs: [4, 10, 2].map((queuedAt) => ({ runId: "run." + queuedAt, targetKind: "custom", targetId: "target", status: "queued", queuedAt, startedAt: 1e100 }))
    })!;
    expect(new Set(projected.clients.map((entry) => entry.key)).size).toBe(2);
    expect(new Set(projected.capabilities.map((entry) => entry.key)).size).toBe(2);
    expect(projected.capabilities[0]!.values).toContainEqual(["Input ids", expect.stringContaining("first 20 of 25")]);
    expect(projected.runs.map((entry) => entry.id)).toEqual(["run.10", "run.4", "run.2"]);
    expect(projected.transports.map((entry) => entry.status)).toEqual(["adapter", "transport"]);
  });
});
