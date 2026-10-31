import type { AutomationStudioFlowScriptExamples } from "./contracts.ts";

const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;
const CONTROL_CHARACTER = /(?!\n)\p{Cc}/u;
const SECTIONS = ["format", "act", "loop", "state"] as const;
const MAX_AUTHORED_BYTES = 64 * 1024;
const MAX_SECTION_LINES = 4096;

/** Validate at bind and retain only independent, immutable authored metadata. */
export function assertAutomationStudioFlowScriptExamples(value: unknown, domainId: string): AutomationStudioFlowScriptExamples {
  const prefix = `Automation Studio domain "${domainId}" flow script examples`;
  const fail = (reason: string): never => { throw new Error(`${prefix}: ${reason}`); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("must be an object.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail("must be a plain object.");
  const fields = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !["version", ...SECTIONS].includes(key)) return fail("contains an unknown field.");
    if (!("value" in fields[key]!)) return fail(`${key} must be a data field, not a getter or setter.`);
  }
  const version: unknown = fields.version?.value;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) return fail(`version must match ${VERSION_PATTERN.source}.`);
  let bytes = new TextEncoder().encode(version).length;
  const result: { version: string; format?: readonly string[]; act?: readonly string[]; loop?: readonly string[]; state?: readonly string[] } = { version };
  for (const section of SECTIONS) {
    if (!fields[section]) continue;
    const lines: unknown = fields[section]!.value;
    if (!Array.isArray(lines)) return fail(`${section} must be an array of strings.`);
    if (Object.getPrototypeOf(lines) !== Array.prototype) return fail(`${section} must be a plain array.`);
    if (lines.length > MAX_SECTION_LINES) return fail(`${section} exceeds the ${MAX_SECTION_LINES}-line limit.`);
    const descriptors = Object.getOwnPropertyDescriptors(lines);
    if (Reflect.ownKeys(lines).length !== lines.length + 1) return fail(`${section} must contain only contiguous line entries.`);
    const copy: string[] = [];
    for (let index = 0; index < lines.length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return fail(`${section}[${index}] must be a string data field.`);
      const line: string = descriptor.value;
      if (CONTROL_CHARACTER.test(line)) return fail(`${section}[${index}] contains a control character; only a line feed is allowed.`);
      bytes += new TextEncoder().encode(line).length + (index > 0 ? 1 : 0);
      if (bytes > MAX_AUTHORED_BYTES) return fail(`authored text exceeds the ${MAX_AUTHORED_BYTES}-byte limit.`);
      copy.push(line);
    }
    result[section] = Object.freeze(copy);
  }
  return Object.freeze(result);
}
