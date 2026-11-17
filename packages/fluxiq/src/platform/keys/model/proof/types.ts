export type SessionProof = {
  v: 1;
  alg: "FLUXIQ1-ED25519";
  keyId: string;
  time: string;
  nonce: string;
  aud: string;
  purpose: "session";
  payload: "{}";
  sig: string;
  publicKey: string;
};
