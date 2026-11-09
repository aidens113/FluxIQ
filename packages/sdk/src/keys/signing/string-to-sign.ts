// The canonical string a key signs (keys design, section 3.1): UTF-8, seven fields
// joined by "\n", no trailing newline. It is the only place the format is written down.

import { SdkError } from "../../errors/index.ts";

/** The signing algorithm line of every proof this SDK makes. */
export const PROOF_ALGORITHM = "FLUXIQ1-ED25519";

/** What a proof is for. */
export type ProofPurpose = "session" | "hello" | "rotate" | "device" | "link" | "custody";

export type StringToSignFields = {
  purpose: ProofPurpose;
  audience: string;
  keyId: string;
  time: string;
  nonce: string;
  payloadSha256Hex: string;
};

/** `YYYYMMDDTHHMMSSZ`, UTC. */
export function formatProofTime(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

/** The string to sign. Each field is refused if it holds a newline, which would let one field forge another. */
export function stringToSign(fields: StringToSignFields): string {
  const lines = [PROOF_ALGORITHM, fields.purpose, fields.audience, fields.keyId, fields.time, fields.nonce, fields.payloadSha256Hex];
  for (const line of lines) {
    if (/[\r\n]/u.test(line)) throw new SdkError("protocol", "A field of the string to sign holds a line break.");
  }
  return lines.join("\n");
}
