import { describe, expect, it } from "vitest";
import { IdentityAccessService } from "../../service.ts";
import { createPasswordIdentityProvider } from "../password.ts";

// The password provider is `authenticate` behind the providers port: the same
// session, the same refusals. Dummy passwords; derivations at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

describe("createPasswordIdentityProvider", () => {
  it("signs a person in through the service and refuses what the service refuses", async () => {
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    const provider = createPasswordIdentityProvider(identity);
    expect(provider.id).toBe("password");
    const signedIn = await provider.signIn({ username: "admin", password: "admin" });
    expect(signedIn).toMatchObject({ user: { id: "admin" }, role: { id: "admin" } });
    await expect(identity.validateSession(signedIn.session.id)).resolves.toMatchObject({ user: { id: "admin" } });
    await expect(provider.signIn({ username: "admin", password: "dummy-password-wrong" })).rejects.toThrow("Invalid username or credentials");
  });

  it("passes the authenticator code and session lifetime through, and nothing else", async () => {
    const calls: unknown[] = [];
    const provider = createPasswordIdentityProvider({
      authenticate: async (input) => {
        calls.push(input);
        throw new Error("refused");
      }
    });
    await expect(provider.signIn({ username: "u", password: "p" })).rejects.toThrow("refused");
    await expect(provider.signIn({ username: "u", password: "p", totp: "123456", ttlMs: 1000 })).rejects.toThrow("refused");
    expect(calls).toEqual([{ username: "u", password: "p" }, { username: "u", password: "p", totp: "123456", ttlMs: 1000 }]);
  });
});
