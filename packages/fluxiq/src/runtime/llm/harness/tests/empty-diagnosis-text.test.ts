// A diagnosis text the model left empty is a field it did not answer. The
// instruction already asks it to omit what it cannot answer, and a build-test
// judge that finds nothing to change says so with `changed: ""`; refusing that
// threw away a "yes" verdict and ended the build "not verified" (live run
// muqk713g). An empty or blank text is read as omitted, and one that is not a
// string is still refused. A too-long one is read clipped
// (`long-diagnosis-text.test.ts`).

import { describe, expect, it } from "vitest";
import { parseAutomationStudioLlmProviderResult } from "../index.ts";

const parse = (diagnosis: Record<string, unknown>) => {
  const raw = { response: { kind: "diagnosis", summary: "The result answers the request.", diagnosis } };
  return { raw, result: parseAutomationStudioLlmProviderResult(raw, "diagnosis") };
};

describe("an empty diagnosis text", () => {
  it("is read as omitted: accepted, and absent from the parsed diagnosis", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      const { raw, result } = parse({ answersRequest: "yes", observed: "Three rows came back.", changed: blank, expected: blank });
      expect(result.diagnostics.map((diagnostic) => diagnostic.code), JSON.stringify(blank)).not.toContain("llm_output.invalid_diagnosis_text");
      expect(result.response?.kind).toBe("diagnosis");
      const diagnosis = result.response?.kind === "diagnosis" ? result.response.diagnosis : undefined;
      expect(diagnosis).toEqual({ answersRequest: "yes", observed: "Three rows came back." });
      // The provider's own reply is left as it came.
      expect(raw.response.diagnosis).toHaveProperty("changed", blank);
    }
  });

  it("still refuses a text that is not a string", () => {
    for (const refused of [3, null, ["x"], { text: "x" }]) {
      const { result } = parse({ answersRequest: "no", changed: refused });
      expect(result.response, JSON.stringify(refused)).toBeUndefined();
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_text");
    }
  });
});
