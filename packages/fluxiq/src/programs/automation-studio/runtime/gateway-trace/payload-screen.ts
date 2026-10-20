// Secret screening of one trace event's payload before it is stored (D15).
//
// Every string leaf and every key, at every depth, goes through the screen
// that keeps credentials from a provider (`screenAutomationStudioLlmEvidence`
// with no denied keys: a trace keeps page payloads, since they are what Core
// received) -- which also finds card numbers. A leaf holding a card number and
// nothing else secret keeps its other words, with only the digit run withheld;
// any other hit withholds the whole leaf. A secret-shaped key is renamed, so
// the redaction's path never repeats it.
//
// One exemption (D21): a leaf that is exactly a lower-case hex SHA-256, an
// artifact digest, is not screened for card numbers, since one random digest
// in about 450 holds a digit run that passes Luhn. It still goes through every
// credential shape. The LLM evidence screen keeps no such exemption.
//
// Nothing found: the payload is returned as it came, so a text payload stays
// the exact text received. Anything found: the payload becomes JSON with each
// offending leaf replaced by a marker, and each replacement is declared as a
// `secret` redaction at its JSON pointer. The raw text of such an event is
// never kept.

import type { ClientGatewayTracePayloadInput, ClientGatewayTraceRedaction } from "../../../../client-gateway/index.ts";
import { automationStudioWithoutCardNumbers, screenAutomationStudioLlmEvidence } from "../llm/index.ts";

const SECRET_MARKER = "[withheld: secret]";
/** A lower-case hex SHA-256 and nothing else. */
const SHA256_DIGEST = /^[0-9a-f]{64}$/u;
/**
 * What stands in for a card-shaped digit run when a digest is screened: one
 * digit, so a credential shape that needs a digit still sees one, and never a
 * card itself. A digest's digit runs border only letters, so it joins no run.
 */
const DIGEST_CARD_STAND_IN = "0";

type Screened = { payload: ClientGatewayTracePayloadInput; redactions: readonly ClientGatewayTraceRedaction[] };
type Parsed = { ok: true; value: unknown } | { ok: false };

/** The payload to store and the redactions it declares; the payload itself when nothing was found. */
export function screenAutomationStudioGatewayTracePayload(payload: ClientGatewayTracePayloadInput): Screened {
  if (payload.encoding === "none") return { payload, redactions: [] };
  if (payload.encoding === "json") return screenStructured(payload, payload.value);
  if (typeof payload.text !== "string") return { payload, redactions: [] };
  const parsed = parseJson(payload.text);
  return screenStructured(payload, parsed.ok ? parsed.value : payload.text);
}

function screenStructured(payload: ClientGatewayTracePayloadInput, value: unknown): Screened {
  const redactions: ClientGatewayTraceRedaction[] = [];
  const screened = screenValue(value, "", redactions, new Set<object>());
  if (redactions.length === 0) return { payload, redactions };
  return { payload: { encoding: "json", value: screened }, redactions };
}

function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    // Unparseable text is screened as one string leaf.
    return { ok: false };
  }
}

function screenValue(value: unknown, path: string, redactions: ClientGatewayTraceRedaction[], ancestors: Set<object>): unknown {
  if (typeof value === "string") return screenLeaf(value, path, redactions);
  // Anything not JSON data, a cycle included, is left for the recorder to refuse as a loss.
  if (value === null || typeof value !== "object" || ancestors.has(value)) return value;
  ancestors.add(value);
  const screened = Array.isArray(value) ? screenArray(value, path, redactions, ancestors) : screenRecord(value, path, redactions, ancestors);
  ancestors.delete(value);
  return screened;
}

function screenArray(value: readonly unknown[], path: string, redactions: ClientGatewayTraceRedaction[], ancestors: Set<object>): unknown {
  let changed = false;
  const items = value.map((item, index) => {
    const screened = screenValue(item, `${path}/${index}`, redactions, ancestors);
    if (screened !== item) changed = true;
    return screened;
  });
  return changed ? items : value;
}

function screenRecord(value: object, path: string, redactions: ClientGatewayTraceRedaction[], ancestors: Set<object>): unknown {
  const original = Object.entries(value);
  const taken = new Set(original.map(([key]) => key));
  let changed = false;
  const entries: [string, unknown][] = [];
  for (const [key, field] of original) {
    const name = secretShaped(key) ? replacementKey(taken) : key;
    if (name !== key) {
      changed = true;
      redactions.push({ path: `${path}/${pointerToken(name)}`, reason: "secret" });
    }
    const screened = screenValue(field, `${path}/${pointerToken(name)}`, redactions, ancestors);
    if (screened !== field) changed = true;
    entries.push([name, screened]);
  }
  // fromEntries defines own data properties, so a "__proto__" key stays a key.
  return changed ? Object.fromEntries(entries) : value;
}

function screenLeaf(text: string, path: string, redactions: ClientGatewayTraceRedaction[]): string {
  if (SHA256_DIGEST.test(text)) return screenDigest(text, path, redactions);
  if (!secretShaped(text)) return text;
  redactions.push({ path, reason: "secret" });
  const withoutCards = automationStudioWithoutCardNumbers(text, SECRET_MARKER);
  return withoutCards !== text && !secretShaped(withoutCards) ? withoutCards : SECRET_MARKER;
}

/** A digest leaf: screened by every credential shape, never by the card-number screen. */
function screenDigest(text: string, path: string, redactions: ClientGatewayTraceRedaction[]): string {
  const withoutCards = automationStudioWithoutCardNumbers(text, DIGEST_CARD_STAND_IN);
  if (!secretShaped(withoutCards)) return text;
  redactions.push({ path, reason: "secret" });
  return SECRET_MARKER;
}

function secretShaped(text: string): boolean {
  return screenAutomationStudioLlmEvidence(text, []).secretShaped;
}

function replacementKey(taken: Set<string>): string {
  let index = 0;
  while (taken.has(`[withheld secret key ${index}]`)) index += 1;
  const key = `[withheld secret key ${index}]`;
  taken.add(key);
  return key;
}

/** RFC 6901: `~` and `/` escaped in one reference token. */
function pointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
