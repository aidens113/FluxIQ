// A fake engine that already trusts one fresh key, and that key as PEM for the SDK.

import { generateKeyPair } from "../../keys/index.ts";
import { loadPrivateKeyText } from "../../keys/index.ts";
import { startFakeEngine, type FakeEngine, type FakeEngineOptions } from "./start-fake-engine.ts";

export type KeyedEngine = { engine: FakeEngine; privateKeyPem: string; keyId: string };

/** Starts the engine with keys required and one trusted key. */
export async function startKeyedEngine(options: FakeEngineOptions): Promise<KeyedEngine> {
  const pair = generateKeyPair();
  const engine = await startFakeEngine({ requireKey: true, ...options });
  engine.trust(loadPrivateKeyText(pair.privateKeyPem, "test").publicKeySpki.toString("base64url"));
  return { engine, privateKeyPem: pair.privateKeyPem, keyId: pair.keyId };
}
