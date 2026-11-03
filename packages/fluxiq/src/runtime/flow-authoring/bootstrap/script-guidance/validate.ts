import { AUTOMATION_STUDIO_AUTHORED_METADATA_REVISION_PATTERN as VERSION_PATTERN } from "../../authored-metadata/index.ts";
import type { AutomationStudioFlowScriptGuidance } from "./contracts.ts";

/** Admit host-authored guidance as independent, immutable own data. */
export function assertAutomationStudioFlowScriptGuidance(value: unknown, domainId: string): AutomationStudioFlowScriptGuidance {
  const fail = (reason: string): never => { throw new Error(`Automation Studio domain "${domainId}" flow script guidance: ${reason}`); };
  const record = (input: unknown, keys: readonly string[], name: string): PropertyDescriptorMap => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail(`${name} must be a plain object.`);
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail(`${name} must be a plain object.`);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== "string" || !keys.includes(key)) return fail(`${name} contains an unknown field.`);
      if (!("value" in descriptors[key]!)) return fail(`${name}.${key} must be a data field.`);
    }
    return descriptors;
  };
  const fields = record(value, ["version", "act"], "guidance");
  const version: unknown = fields.version?.value;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) return fail("version must be a lowercase revision of at most 64 characters.");
  const result: { version: string; act?: { readonly controlOperations?: readonly string[] } } = { version };
  let bytes = new TextEncoder().encode(version).length;
  if (fields.act) {
    const act = record(fields.act.value, ["controlOperations"], "act");
    const copy: { controlOperations?: readonly string[] } = {};
    if (act.controlOperations) {
      const paragraphs: unknown = act.controlOperations.value;
      if (!Array.isArray(paragraphs) || Object.getPrototypeOf(paragraphs) !== Array.prototype) return fail("act.controlOperations must be a plain array.");
      if (paragraphs.length > 4096) return fail("act.controlOperations exceeds the 4096-paragraph limit.");
      if (Reflect.ownKeys(paragraphs).length !== paragraphs.length + 1) return fail("act.controlOperations must contain only contiguous paragraph entries.");
      const descriptors = Object.getOwnPropertyDescriptors(paragraphs);
      const entries: string[] = [];
      for (let index = 0; index < paragraphs.length; index++) {
        const entry = descriptors[String(index)];
        if (!entry || !("value" in entry) || typeof entry.value !== "string") return fail(`act.controlOperations[${index}] must be a string data field.`);
        const text: string = entry.value;
        if (/(?!\n)\p{Cc}/u.test(text)) return fail("only LF control characters are allowed.");
        bytes += new TextEncoder().encode(text).length + (index > 0 ? 1 : 0);
        if (bytes > 65536) return fail("authored text exceeds the 65536-byte limit.");
        entries.push(text);
      }
      copy.controlOperations = Object.freeze(entries);
    }
    result.act = Object.freeze(copy);
  }
  return Object.freeze(result);
}
