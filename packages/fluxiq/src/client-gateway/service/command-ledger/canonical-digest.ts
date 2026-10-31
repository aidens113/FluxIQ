import { createHash } from "node:crypto";

type Limits = { maxDepth: number; maxBytes?: number; maxNodes?: number };

/** Exact plain JSON, streamed in canonical order without buffering the encoded document. */
export function clientGatewayCanonicalDigest(value: unknown, limits: Limits): string {
  const hash = createHash("sha256");
  const ancestors = new Set<object>();
  let bytes = 0;
  let nodes = 0;
  const append = (text: string) => {
    if (limits.maxBytes !== undefined) {
      bytes += Buffer.byteLength(text, "utf8");
      if (bytes > limits.maxBytes) {
        throw new Error("command_ledger.hash_size_limit");
      }
    }
    hash.update(text);
  };
  const compareKeys = (left: string, right: string): number => {
    const a = Array.from(left, char => char.codePointAt(0)!);
    const b = Array.from(right, char => char.codePointAt(0)!);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      if (a[index] !== b[index]) {
        return a[index]! - b[index]!;
      }
    }
    return a.length - b.length;
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > limits.maxDepth || limits.maxNodes !== undefined && ++nodes > limits.maxNodes) {
      throw new Error("command_ledger.hash_structure_limit");
    }
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) {
      append(JSON.stringify(item));
      return;
    }
    if (typeof item !== "object" || ancestors.has(item)) {
      throw new Error("command_ledger.invalid_digest_value");
    }
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new Error("command_ledger.nonplain_digest_value");
    }
    const ownKeys = Reflect.ownKeys(item);
    if (ownKeys.some(key => typeof key !== "string") || limits.maxNodes !== undefined && ownKeys.length > limits.maxNodes + 1) {
      throw new Error("command_ledger.invalid_digest_fields");
    }
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const fields = (ownKeys as string[]).filter(key => !array || key !== "length");
    if (fields.some(key => !descriptors[key]!.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) {
      throw new Error("command_ledger.invalid_digest_fields");
    }
    const length: number = array ? descriptors.length!.value : 0;
    if (array && (
      limits.maxNodes !== undefined && length > limits.maxNodes
      || fields.length !== length
      || fields.some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)
    )) {
      throw new Error("command_ledger.invalid_digest_array");
    }
    ancestors.add(item);
    append(array ? "[" : "{");
    const keys = array ? fields : fields.sort(compareKeys);
    for (let index = 0; index < (array ? length : keys.length); index++) {
      const key = array ? String(index) : keys[index]!;
      if (index) {
        append(",");
      }
      if (!array) {
        append(JSON.stringify(key));
        append(":");
      }
      visit(descriptors[key]!.value, depth + 1);
    }
    append(array ? "]" : "}");
    ancestors.delete(item);
  };
  visit(value, 0);
  return `sha256:${hash.digest("hex")}`;
}
