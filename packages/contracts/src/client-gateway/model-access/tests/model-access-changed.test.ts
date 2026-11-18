// `server.model_access_changed`: the payload carries the person's model access in the paired-client form, and the
// reader keeps only a valid state, never a key id or anything beside `modelAccess`.
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ModelAccessState } from "../../../platform/index.ts";
import { readClientGatewayModelAccessChanged, type ClientGatewayModelAccessChanged, type ClientGatewayServerMessage } from "../../index.ts";

const REFUSED: ModelAccessState = { status: "provider_refused", message: "The provider refused this key.", key: { name: "Work", provider: "anthropic", model: "claude-test" }, lastCall: { outcome: "provider_refused", atMs: 5 } };
const NO_KEY: ModelAccessState = { status: "no_key", message: "Add a model key to start.", key: null, lastCall: null };

describe("server.model_access_changed", () => {
  it("is a server message whose payload is the model access alone", () => {
    const message: ClientGatewayServerMessage = { id: "message.1", type: "server.model_access_changed", protocolVersion: "0.1.0", timestamp: 1, payload: { modelAccess: NO_KEY } };
    expect(message.type).toBe("server.model_access_changed");
    expectTypeOf<Extract<ClientGatewayServerMessage, { type: "server.model_access_changed" }>["payload"]>().toEqualTypeOf<ClientGatewayModelAccessChanged>();
    expectTypeOf<ClientGatewayModelAccessChanged>().toEqualTypeOf<{ modelAccess: ModelAccessState }>();
  });

  it("reads a valid state and keeps nothing beside it", () => {
    expect(readClientGatewayModelAccessChanged({ modelAccess: REFUSED })).toEqual({ modelAccess: REFUSED });
    expect(readClientGatewayModelAccessChanged({ modelAccess: { ...NO_KEY, extra: "dropped" }, other: "dropped" })).toEqual({ modelAccess: NO_KEY });
  });

  it("refuses a key id, which a paired client is never handed", () => {
    expect(readClientGatewayModelAccessChanged({ modelAccess: { ...REFUSED, key: { ...REFUSED.key, id: "key.1" } } })).toBeNull();
  });

  it("refuses a payload that is not one, or a state that contradicts itself", () => {
    for (const payload of [null, undefined, "ready", [], {}, { modelAccess: null }, { modelAccess: { ...REFUSED, lastCall: null } }, { modelAccess: { ...NO_KEY, key: REFUSED.key } }]) {
      expect(readClientGatewayModelAccessChanged(payload)).toBeNull();
    }
  });
});
