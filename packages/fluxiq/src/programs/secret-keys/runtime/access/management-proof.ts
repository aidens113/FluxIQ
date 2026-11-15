const brand: unique symbol = Symbol("SecretKeyManagementProof");
export type SecretKeyManagementProof = { readonly [brand]: true };
type Proof = { id: string; userId: string; operation: "reveal"; expiresAtMs: number; validate(): Promise<boolean> };
const proofs = new WeakMap<SecretKeyManagementProof, Proof>();

/** Internal API adapter capability, minted only after password and operation IAM checks. */
export function createSecretKeyManagementProof(input: Proof): SecretKeyManagementProof {
  const proof: SecretKeyManagementProof = Object.freeze({ [brand]: true });
  proofs.set(proof, { ...input });
  return proof;
}

/** One use, even on refusal; a serialized object or model-use grant is not this capability. */
export async function consumeSecretKeyManagementProof(proof: SecretKeyManagementProof, id: string, now: () => number): Promise<Proof> {
  const record = proof && typeof proof === "object" ? proofs.get(proof) : undefined;
  if (record) proofs.delete(proof);
  if (!record || record.id !== id || record.operation !== "reveal" || record.expiresAtMs <= now() || !await record.validate()) throw new Error("Secret key management proof is unavailable.");
  return record;
}
