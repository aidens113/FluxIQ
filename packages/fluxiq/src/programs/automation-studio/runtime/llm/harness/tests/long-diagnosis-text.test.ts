// A diagnosis text longer than its bound never voids the reply (live run
// murwcmx2, step 0033). The judge's second call answered a clear
// `answersRequest: no` with a full diagnosis whose `changed` ran to 581
// characters; the whole reply was refused as `llm_output.invalid_diagnosis_text`,
// verify read it as a call that did not come back, and the refutation the two
// calls agreed on was recorded as unconfirmed. An over-long text is read clipped
// to the bound, at a word boundary and visibly marked, with a warning naming the
// field; the verdict and the other fields stand.

import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH, parseAutomationStudioLlmProviderResult } from "../index.ts";

const MAX = AUTOMATION_STUDIO_LLM_DIAGNOSIS_TEXT_MAX_LENGTH;
const MARK = "[clipped]";

/** Step 0033's `changed`, as the model sent it: 581 characters. */
const RUN_MURWCMX2_CHANGED = "The name condition in s7 (extractList.where name contains ear tips/charging case/eartips, not) is over-broad: it excludes earbuds that merely include a charging case. Narrow it to accessory-only titles (e.g. require the title to start with or be dominated by accessory terms, or exclude only when the item is not earbuds). The ad condition (data-ad-id absent) also removed genuine earbuds; verify the ad attribute selector or use a more specific sponsored marker. Also confirm the 5-page stop is the true end of results, not a page limit, since the instructions require every page.";
const RUN_MURWCMX2_EXPECTED = "Every wireless earbuds pair that is Brightaisle Plus eligible, rated >= 4.0, priced < 50, across all result pages, excluding sponsored placements and accessories, deduped by url, in search order, with columns name, price, rating, url.";

const parse = (diagnosis: Record<string, unknown>) => {
  const raw = { response: { kind: "diagnosis", summary: "The read's name condition is over-broad.", diagnosis } };
  const result = parseAutomationStudioLlmProviderResult(raw, "diagnosis");
  return { raw, result, diagnosis: result.response?.kind === "diagnosis" ? result.response.diagnosis : undefined };
};

describe("an over-long diagnosis text", () => {
  it("run murwcmx2: the reply stands, its verdict and other fields whole, and the long text is read clipped", () => {
    expect(RUN_MURWCMX2_CHANGED.length).toBe(581);
    const { raw, result, diagnosis } = parse({ answersRequest: "no", expected: RUN_MURWCMX2_EXPECTED, changed: RUN_MURWCMX2_CHANGED, stillAchievable: "yes", patchNeeded: true });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.response?.kind).toBe("diagnosis");
    expect(diagnosis).toMatchObject({ answersRequest: "no", expected: RUN_MURWCMX2_EXPECTED, stillAchievable: "yes", patchNeeded: true });
    const changed = diagnosis?.changed ?? "";
    expect(changed.length).toBeLessThanOrEqual(MAX);
    expect(changed.endsWith(MARK)).toBe(true);
    // What is kept is the text's own start, cut where a word ends.
    const kept = changed.slice(0, changed.lastIndexOf(MARK)).replace(/[\s.…]+$/u, "");
    expect(RUN_MURWCMX2_CHANGED.startsWith(kept)).toBe(true);
    expect(RUN_MURWCMX2_CHANGED.charAt(kept.length)).toMatch(/[\s.,;:]/u);
    expect(kept.length).toBeGreaterThan(MAX / 2);
    // The provider's own reply is left as it came.
    expect(raw.response.diagnosis.changed).toBe(RUN_MURWCMX2_CHANGED);
  });

  it("is said in a warning naming the field, never an error", () => {
    const { result } = parse({ answersRequest: "no", changed: RUN_MURWCMX2_CHANGED });
    const clipped = result.diagnostics.filter((diagnostic) => diagnostic.path === "response.diagnosis.changed");
    expect(clipped).toEqual([expect.objectContaining({ severity: "warning", code: "llm_output.diagnosis_text_clipped", path: "response.diagnosis.changed" })]);
    expect(clipped[0]?.message).toContain("changed");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.invalid_diagnosis_text");
  });

  it("clips each long field on its own, and leaves one at the bound as it came", () => {
    const atBound = `${"word ".repeat(MAX / 5 - 1)}last.`;
    expect(atBound.length).toBe(MAX);
    const { result, diagnosis } = parse({ answersRequest: "unknown", expected: atBound, observed: RUN_MURWCMX2_CHANGED, changed: `${RUN_MURWCMX2_CHANGED} ${RUN_MURWCMX2_CHANGED}` });
    expect(diagnosis?.expected).toBe(atBound);
    expect(diagnosis?.observed?.endsWith(MARK)).toBe(true);
    expect(diagnosis?.changed?.endsWith(MARK)).toBe(true);
    expect(diagnosis?.changed?.length).toBeLessThanOrEqual(MAX);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === "llm_output.diagnosis_text_clipped").map((diagnostic) => diagnostic.path))
      .toEqual(["response.diagnosis.observed", "response.diagnosis.changed"]);
  });

  it("cuts a text with no word boundary in reach at the bound, still marked", () => {
    const { diagnosis } = parse({ answersRequest: "no", changed: "x".repeat(MAX * 3) });
    expect(diagnosis?.changed?.length).toBeLessThanOrEqual(MAX);
    expect(diagnosis?.changed?.startsWith("x".repeat(MAX - 20))).toBe(true);
    expect(diagnosis?.changed?.endsWith(MARK)).toBe(true);
  });

  it("is not clipped when only its surrounding whitespace runs past the bound", () => {
    const text = "y".repeat(MAX - 2);
    const { result, diagnosis } = parse({ answersRequest: "no", changed: `   ${text}   ` });
    expect(diagnosis?.changed).toBe(text);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("llm_output.diagnosis_text_clipped");
  });
});
