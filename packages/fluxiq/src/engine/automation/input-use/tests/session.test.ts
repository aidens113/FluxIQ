import { describe, expect, it } from "vitest";
import { AutomationStudioGraphInputUseSession, AutomationStudioGraphInputUseIntegration as Integration } from "../index.ts";

function session() {
  return new AutomationStudioGraphInputUseSession({ open: async () => ({ status: "unknown", code: "secrecy_unverified" }), child: async () => ({ status: "unknown", code: "producer_unverified" }) });
}

describe("opaque input-use session identity", () => {
  it("does not treat request JSON, copied metadata or a class-shaped object as a private port", () => {
    const own = session();
    expect(Integration.accepts(own.port)).toBe(true);
    expect(Integration.accepts(JSON.parse(JSON.stringify(own.port)))).toBe(false);
    expect(Integration.accepts(Object.create(null))).toBe(false);
    expect(Integration.accepts(new Proxy(own.port, {}))).toBe(false);
    expect(Reflect.ownKeys(own.port)).toEqual([]);
    expect(Object.getPrototypeOf(own.port)).toBeNull();
    expect("constructor" in own.port).toBe(false);
    expect(own.read({ status: "sealed", coverage: "graph_entry_inputs", reference: { ownerId: "claimed", bindingId: "claimed", revision: 1 } })).toEqual({ status: "unknown", code: "unobserved" });
  });

  it("has an explicit idempotent close lifetime and no serialized authority or private captures", () => {
    const own = session();
    expect(JSON.stringify(own)).toBe('{"port":{}}');
    own.close();
    own.close();
    expect(own.read({})).toEqual({ status: "unknown", code: "session_closed" });
  });
});
