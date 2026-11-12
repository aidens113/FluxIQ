import type { FluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { describe, expect, it } from "vitest";
import { fluxNodeRequestIdentity } from "../request-identity.ts";

const request = (inputs: Record<string, string>) => ({ name: "library.test", inputs, idempotencyKey: "same" }) as FluxNodeRunRequest;

describe("secret-free request identity", () => {
  it("keeps two secret binding positions distinct when equal values later rotate independently", () => {
    const pointers = ["/inputs/first", "/inputs/second"];
    expect(fluxNodeRequestIdentity(request({ first: "same", second: "same" }), pointers)).toEqual(
      fluxNodeRequestIdentity(request({ first: "rotated-one", second: "rotated-two" }), pointers)
    );
  });

  it("keeps a non-secret field significant even when it happens to equal a declared secret", () => {
    const projected = fluxNodeRequestIdentity(request({ password: "same", public: "same" }), ["/inputs/password"]);
    expect(projected.projection).toMatchObject({ inputs: { password: { secretBinding: "/inputs/password" }, public: "same" } });
    expect(fluxNodeRequestIdentity(request({ password: "other", public: "same" }), ["/inputs/password"])).toEqual(projected);
    expect(fluxNodeRequestIdentity(request({ password: "same", public: "changed" }), ["/inputs/password"])).not.toEqual(projected);
  });
});
