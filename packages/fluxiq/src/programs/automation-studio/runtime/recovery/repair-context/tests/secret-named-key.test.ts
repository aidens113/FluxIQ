import { describe, expect, it } from "vitest";
import { automationStudioScreenedNodeParameters } from "../parameter-screen.ts";
import { automationStudioSecretNamedKey } from "../secret-named-key.ts";

// A key names a secret by its words. The bare word `key` does not: a keyboard
// step is authored with `key: "Enter"`, and the repair must see which key it
// pressed. The kinds of key that are secret are named in full.
describe("automationStudioSecretNamedKey", () => {
  it("does not treat a keyboard step's key as a secret", () => {
    for (const key of ["key", "keys", "Key", "keyName", "pressKey", "key_code", "hotkey", "keyword"]) {
      expect(automationStudioSecretNamedKey(key), key).toBe(false);
    }
    const screened = automationStudioScreenedNodeParameters({ key: "Enter", hotkey: "Ctrl+K" } as never, []);
    expect(screened.values).toEqual({ key: "Enter", hotkey: "Ctrl+K" });
    expect(screened.withheld).toEqual([]);
  });

  it("still names every kind of key that is a secret, however it is spelled", () => {
    for (const key of ["apikey", "apiKey", "api_key", "x-api-key", "API_KEY", "secretKey", "secret_key", "privateKey", "private_key_pem", "accessKey", "aws_access_key", "signingKey", "encryptionKey", "sessionKey", "licenseKey"]) {
      expect(automationStudioSecretNamedKey(key), key).toBe(true);
    }
  });

  it("still names the rest of the secret words", () => {
    for (const key of ["password", "pinCode", "authToken", "cardNumber", "cvv", "otp", "clientSecret", "sessionId", "jwt", "credentials"]) {
      expect(automationStudioSecretNamedKey(key), key).toBe(true);
    }
  });
});
