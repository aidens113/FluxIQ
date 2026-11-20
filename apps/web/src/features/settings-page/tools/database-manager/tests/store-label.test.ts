import { describe, expect, it } from "vitest";
import { storeLabel } from "../store-label";

describe("storeLabel", () => {
  it("says a store's id in plain words", () => {
    expect(storeLabel("identity.users")).toBe("Users");
    expect(storeLabel("secret.credential-unlocks")).toBe("Credential unlocks");
    expect(storeLabel("secret.keys")).toBe("Keys");
    expect(storeLabel("public.other")).toBe("Other");
    expect(storeLabel("run_history")).toBe("Run history");
  });
  it("never answers nothing", () => {
    expect(storeLabel("")).toBe("");
    expect(storeLabel("...")).toBe("...");
  });
});
