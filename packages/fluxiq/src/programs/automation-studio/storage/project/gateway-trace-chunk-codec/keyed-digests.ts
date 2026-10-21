// Keyed digests for persisted gateway traces (t745 design note D1, D2): the gear
// table a protected store cuts with, a chunk's digest in a row's form, and an
// artifact row's digest in its form. In every case a row that names no key is
// in the old form (plain SHA-256, public gear), and a keyed form with no keyring,
// or under a key the keyring does not hold, throws: a keyed row is never taken
// as verified when it was not. Messages name digests and key ids, nothing more.
//
// The gear table: with the public table the sequence of chunk lengths of an
// event confirms a guessed body even when every digest is keyed, so a protected
// store derives its table from the address key, as borg keys its chunker seed:
// word v is the first four bytes (int32, big-endian) of the key's address of the
// single byte v in the "gateway-trace-gear" domain. Cached per keyring and key
// id: a table is 256 HMACs, and every append under one key cuts with one table.
//
// An artifact row's `sha256` column: the plain SHA-256 (hex) when it names no
// key, else the hex of the keyring's address of the bytes under that key
// ("gateway-trace-artifact"). A protected store writes the keyed form under its
// current key; a rewrite is compared in the stored row's own form. The wire
// digest (`listArtifacts`) is always recomputed from the bytes read back.
import { createHash } from "node:crypto";
import { clientGatewayTraceArtifactDigest } from "../../../../../client-gateway/trace/index.ts";
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";

const gearTables = new WeakMap<AutomationStudioContentAddressKeyring, Map<string, Int32Array>>();

export function gatewayTraceKeyedGearTable(keyring: AutomationStudioContentAddressKeyring, keyId: string): Int32Array {
  let byKey = gearTables.get(keyring);
  if (byKey === undefined) {
    byKey = new Map();
    gearTables.set(keyring, byKey);
  }
  const known = byKey.get(keyId);
  if (known !== undefined) return known;
  const table = new Int32Array(256);
  for (let value = 0; value < 256; value += 1) table[value] = keyring.addressWith(keyId, "gateway-trace-gear", Uint8Array.of(value)).readInt32BE(0);
  byKey.set(keyId, table);
  return table;
}

export function gatewayTraceChunkDigest(input: {
  keyring: AutomationStudioContentAddressKeyring | undefined;
  addressKeyId: string | null;
  bytes: Uint8Array;
  /** The chunk's name in messages: its digest in hex. */
  name: string;
}): Buffer {
  if (input.addressKeyId === null) return createHash("sha256").update(input.bytes).digest();
  if (input.keyring === undefined) {
    throw new Error(`gateway trace chunk ${input.name} is keyed under ${input.addressKeyId} and cannot be verified without the project's content address keyring`);
  }
  if (!input.keyring.holds(input.addressKeyId)) {
    throw new Error(`gateway trace chunk ${input.name} is keyed under ${input.addressKeyId}, a key this project's keyring does not hold`);
  }
  return input.keyring.addressWith(input.addressKeyId, "gateway-trace-chunk", input.bytes);
}

export function gatewayTraceArtifactRowDigest(input: {
  keyring: AutomationStudioContentAddressKeyring | undefined;
  keyId: string | null;
  bytes: Uint8Array;
  traceId: string;
  artifactId: string;
}): string {
  if (input.keyId === null) return clientGatewayTraceArtifactDigest(input.bytes);
  const where = `artifact ${input.artifactId} of trace ${input.traceId}`;
  if (input.keyring === undefined) throw new Error(`${where} is keyed under ${input.keyId} and cannot be compared without the project's content address keyring`);
  if (!input.keyring.holds(input.keyId)) throw new Error(`${where} is keyed under ${input.keyId}, a key this project's keyring does not hold`);
  return input.keyring.addressWith(input.keyId, "gateway-trace-artifact", input.bytes).toString("hex");
}
