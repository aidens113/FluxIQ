import { describe, expect, it } from "vitest";
import {
  createEnvelope,
  IoRegistry,
  validateDomainIo
} from "./index.ts";

describe("IoRegistry", () => {
  it("reads inputs on demand", async () => {
    const registry = new IoRegistry();
    registry.registerInput("example", {
      definition: { id: "state", title: "State" },
      mode: "request",
      read: () => createEnvelope({ domainId: "example", ioId: "state", payload: { ready: true } })
    });

    const envelope = await registry.readInput<{ ready: boolean }>({ domainId: "example", inputId: "state" });

    expect(envelope.payload.ready).toBe(true);
    expect(envelope.ioId).toBe("state");
  });

  it("subscribes to streamed input events", () => {
    const registry = new IoRegistry();
    registry.registerInput("example", {
      definition: { id: "events", title: "Events" },
      mode: "stream",
      subscribe: (handler) => {
        handler(createEnvelope({ domainId: "example", ioId: "events", sequence: 7, payload: { kind: "tick" } }));
        return () => undefined;
      }
    });

    const events: string[] = [];
    const unsubscribe = registry.subscribeInput<{ kind: string }>("example", "events", (event) => {
      events.push(`${event.sequence}:${event.payload.kind}`);
    });
    unsubscribe();

    expect(events).toEqual(["7:tick"]);
  });

  it("dispatches outputs", async () => {
    const registry = new IoRegistry();
    registry.registerOutput("example", {
      definition: { id: "action", title: "Action" },
      mode: "request",
      dispatch: (request) => ({
        ok: true,
        domainId: request.domainId ?? null,
        outputId: request.outputId,
        payload: { accepted: true }
      })
    });

    const result = await registry.dispatchOutput<{ command: string }, { accepted: boolean }>({
      domainId: "example",
      outputId: "action",
      payload: { command: "run" }
    });

    expect(result.ok).toBe(true);
    expect(result.payload?.accepted).toBe(true);
  });

  it("validates domain manifest input and output adapters", () => {
    const registry = new IoRegistry();
    registry.registerInput("example", {
      definition: { id: "state", title: "State" },
      mode: "request",
      read: () => createEnvelope({ domainId: "example", ioId: "state", payload: {} })
    });

    const issues = validateDomainIo(
      {
        id: "example",
        title: "Example",
        category: "Tests",
        description: "Example domain",
        icon: "blocks",
        inputs: [{ id: "state", title: "State" }],
        outputs: [{ id: "action", title: "Action" }]
      },
      registry
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("domain.output.adapter_missing");
  });
});
