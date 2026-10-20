// A project's content-address keys, held in memory (t745 design note D1, D6).
// An address is HMAC-SHA256 under one key over u32-big-endian length-prefixed
// fields: the version label, the domain, the project id, the context ("" when
// absent) and the content. The length prefixes make every field boundary
// unambiguous, the domain keeps one kind of content from answering for another,
// and the project id plus a random key per project keep addresses from crossing
// projects. Key bytes live in a private field and are redacted from JSON and
// inspection; no error names anything but a key id.
import { createHmac } from "node:crypto";
import { inspect } from "node:util";

/** The closed set of things a content address may name. */
export type AutomationStudioContentAddressDomain =
  | "content-object"
  | "gateway-trace-chunk"
  | "gateway-trace-gear"
  | "gateway-trace-artifact"
  | "reusable-llm-context";

const KNOWN_DOMAINS: Readonly<Record<AutomationStudioContentAddressDomain, true>> = {
  "content-object": true,
  "gateway-trace-chunk": true,
  "gateway-trace-gear": true,
  "gateway-trace-artifact": true,
  "reusable-llm-context": true
};

const ADDRESS_VERSION = Buffer.from("fluxiq.content-address.v1", "utf8");
const ADDRESS_KEY_BYTES = 32;
const MAX_FIELD_BYTES = 0xffff_ffff;
const REDACTED = "[redacted]";

export class AutomationStudioContentAddressKeyring {
  readonly projectId: string;
  readonly currentKeyId: string;
  readonly #keys: Map<string, Buffer>;

  /** Retired keys whose sealed rows did not open: rows under them cannot be verified. */
  readonly unavailableKeyIds: readonly string[];

  /** Copies each key; the caller keeps and may zero its own buffers. */
  constructor(input: { projectId: string; currentKeyId: string; keys: ReadonlyMap<string, Uint8Array>; unavailableKeyIds?: readonly string[] }) {
    if (typeof input.projectId !== "string" || !input.projectId) throw new Error("Content address keyring requires a project id.");
    this.projectId = input.projectId;
    this.currentKeyId = input.currentKeyId;
    this.unavailableKeyIds = Object.freeze([...(input.unavailableKeyIds ?? [])]);
    this.#keys = new Map();
    for (const [keyId, key] of input.keys) {
      if (key.byteLength !== ADDRESS_KEY_BYTES) throw new Error(`Content address key ${keyId} is not a 256-bit key.`);
      this.#keys.set(keyId, Buffer.from(key));
    }
    if (!this.#keys.has(input.currentKeyId)) throw new Error(`Content address key ${input.currentKeyId} is not held by this keyring.`);
  }

  holds(keyId: string): boolean {
    return this.#keys.has(keyId);
  }

  /** The 32-byte address of `content` under the current key. */
  address(domain: AutomationStudioContentAddressDomain, content: Uint8Array | string, context?: string): Buffer {
    return this.addressWith(this.currentKeyId, domain, content, context);
  }

  /** The 32-byte address of `content` under a key this keyring holds, current or retired. */
  addressWith(keyId: string, domain: AutomationStudioContentAddressDomain, content: Uint8Array | string, context?: string): Buffer {
    const key = this.#keys.get(keyId);
    if (!key && this.unavailableKeyIds.includes(keyId)) throw new Error(`Content address key ${keyId} is unavailable: its sealed row did not open.`);
    if (!key) throw new Error(`Content address key ${keyId} is not held by this keyring.`);
    if (!Object.hasOwn(KNOWN_DOMAINS, domain)) throw new Error("Content address domain is not one of the known domains.");
    if (context !== undefined && typeof context !== "string") throw new Error("Content address context must be a string.");
    const hmac = createHmac("sha256", key);
    for (const field of [ADDRESS_VERSION, utf8(domain), utf8(this.projectId), utf8(context ?? ""), bytes(content)]) {
      if (field.byteLength > MAX_FIELD_BYTES) throw new Error("Content address input is too large.");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(field.byteLength);
      hmac.update(length);
      hmac.update(field);
    }
    return hmac.digest();
  }

  toJSON(): { projectId: string; currentKeyId: string; keyIds: string[]; keys: string } {
    return { projectId: this.projectId, currentKeyId: this.currentKeyId, keyIds: [...this.#keys.keys()], keys: REDACTED };
  }

  [inspect.custom](): string {
    return `AutomationStudioContentAddressKeyring { projectId: ${JSON.stringify(this.projectId)}, currentKeyId: ${JSON.stringify(this.currentKeyId)}, keyIds: ${JSON.stringify([...this.#keys.keys()])}, keys: ${REDACTED} }`;
  }
}

function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function bytes(content: Uint8Array | string): Uint8Array {
  if (typeof content === "string") return utf8(content);
  if (content instanceof Uint8Array) return content;
  throw new Error("Content address content must be bytes or a string.");
}
