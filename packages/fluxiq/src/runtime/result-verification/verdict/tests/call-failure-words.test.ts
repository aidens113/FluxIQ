// t974 (F22): a judge's request Core itself built in a form its pre-send check refused was said as "the verification call
// did not come back usable", as though the model had been asked and gave nothing. It was never asked.
import { describe, expect, it } from "vitest";
import { callFailureWords } from "../call-failure-words.ts";

describe("the words for a request Core could not send", () => {
  it("say it was Core's own request, never that no answer came back", () => {
    for (const code of ["llm.provider_request_context_unbounded", "llm.provider_request_construction_failed", "llm.provider_request_task_mismatch"]) {
      expect(callFailureWords(code)).toBe("Core built the judge's request in a form it could not send, so it was never asked");
    }
  });

  it("leave every other family as it was", () => {
    expect(callFailureWords(undefined)).toBe("the verification call did not come back usable");
    expect(callFailureWords("llm.provider_result_summary_invalid")).toBe("the judge's reply could not be read");
    expect(callFailureWords("llm.request.routing_denied_key")).toBe("the judge's request could not be sent");
  });
});
