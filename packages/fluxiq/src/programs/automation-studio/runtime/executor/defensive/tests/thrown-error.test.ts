import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_MAX_RETRY_HINT_MS,
  AUTOMATION_STUDIO_TRANSIENT_STATUSES,
  automationStudioFaultFromThrownError,
  automationStudioRetryHintMs,
  automationStudioTransientStatusEffect
} from "../index.ts";

function classify(error: unknown, aborted = false) {
  return automationStudioFaultFromThrownError(error, { now: 1_000, aborted });
}

function withStatus(status: number): Error & { status: number } {
  return Object.assign(new Error("The request failed."), { status });
}

describe("a transport status decides whether a fault is absorbed", () => {
  it("retries the statuses that say the request was not answered usefully", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      const fault = classify(withStatus(status));

      expect(fault.disposition).toBe("retry");
      expect(fault.code).toBe(`executor.fault.status.${status}`);
      expect(fault.httpStatus).toBe(status);
    }
    expect([...AUTOMATION_STUDIO_TRANSIENT_STATUSES].sort((left, right) => left - right)).toEqual([408, 425, 429, 500, 502, 503, 504]);
  });

  it("separates the statuses that cannot have acted from the ones that might have", () => {
    // A rate limit, a request that arrived too slowly and a service that is not
    // handling requests all state the work was not done. A 500, a 502 and a 504
    // may mean the work was done and only the answer was lost.
    expect(AUTOMATION_STUDIO_TRANSIENT_STATUSES.filter((status) => automationStudioTransientStatusEffect(status) === "unacted")).toEqual([408, 425, 429, 503]);
    expect(AUTOMATION_STUDIO_TRANSIENT_STATUSES.filter((status) => automationStudioTransientStatusEffect(status) === "ambiguous")).toEqual([500, 502, 504]);
  });

  it("refuses a status that will be answered the same way next time", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(classify(withStatus(status)).disposition).toBe("refuse");
    }
    expect(automationStudioTransientStatusEffect(404)).toBeUndefined();
  });

  it("reads a status the thrown value only stated in words, and never a bare number", () => {
    expect(classify(new Error("Upstream replied with status 503")).disposition).toBe("retry");
    expect(classify(new Error("HTTP 429 from the provider")).disposition).toBe("retry");
    expect(classify(new Error("503 Service Unavailable")).disposition).toBe("retry");
    // A row count is not a status. Reading it as one would turn a deterministic
    // answer into three attempts.
    expect(classify(new Error("Refused: 500 rows is over the export limit")).code).toBe("executor.fault.unclassified");
  });

  it("reads a status carried on a nested answer or a cause", () => {
    expect(classify(Object.assign(new Error("failed"), { response: { status: 502 } })).httpStatus).toBe(502);
    expect(classify(new Error("wrapped", { cause: withStatus(504) })).httpStatus).toBe(504);
  });
});

describe("a transport fault decides whether a fault is absorbed", () => {
  it("retries a connection that never reached anything, and says nothing acted", () => {
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]) {
      const fault = classify(Object.assign(new Error("connect failed"), { code }));

      expect(fault.disposition).toBe("retry");
      expect(fault.effect).toBe("unacted");
      expect(fault.code).toBe(`executor.fault.transport.${code.toLowerCase()}`);
    }
  });

  it("retries a connection that dropped after the request went out, and says the act may have landed", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "EPIPE", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"]) {
      const fault = classify(Object.assign(new Error("dropped"), { code }));

      expect(fault.disposition).toBe("retry");
      expect(fault.effect).toBe("ambiguous");
    }
  });

  it("retries an aborted request and a timeout by their own type names", () => {
    expect(classify(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }))).toMatchObject({ disposition: "retry", category: "timeout" });
    expect(classify(Object.assign(new Error("It took too long."), { name: "TimeoutError" })).disposition).toBe("retry");
  });

  it("refuses an abort raised while the run was already being cancelled", () => {
    // The deadline it passed will not come back, so attempting again inside it
    // spends time that has already been spent.
    const fault = classify(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }), true);

    expect(fault.disposition).toBe("refuse");
    expect(fault.code).toBe("executor.fault.cancelled");
  });
});

describe("an answer that could not be read, and one that says nothing", () => {
  it("retries an answer that could not be parsed", () => {
    const fault = classify(Object.assign(new SyntaxError("Unexpected end of JSON input"), { name: "SyntaxError" }));

    expect(fault.disposition).toBe("retry");
    expect(fault.code).toBe("executor.fault.malformed_answer");
  });

  it("retries text that states a transient fault with no code or status at all", () => {
    for (const message of ["fetch failed", "socket hang up", "The service is temporarily unavailable.", "Rate limit reached, try again"]) {
      expect(classify(new Error(message)).disposition).toBe("retry");
    }
  });

  it("refuses a defect in the node itself, because attempting it again learns nothing", () => {
    const fault = classify(new TypeError("cannot read properties of undefined"));

    expect(fault.disposition).toBe("refuse");
    expect(fault.code).toBe("executor.fault.unclassified");
    expect(fault.reason).toContain("states nothing transient");
  });

  it("classifies a thrown value that is not an error at all", () => {
    expect(classify("connection reset by peer").disposition).toBe("retry");
    expect(classify(null).disposition).toBe("refuse");
  });
});

describe("a delay the failing source asked for", () => {
  it("reads it from a metadata bag that answers by name, in seconds", () => {
    const bag = new Map<string, string>([["retry-after", "2"]]);
    const error = Object.assign(new Error("Too many requests"), { status: 429, headers: bag });

    expect(classify(error).hintedWaitMs).toBe(2_000);
  });

  it("reads it from a plain object, from a nested answer, and as milliseconds when named so", () => {
    expect(automationStudioRetryHintMs({ "Retry-After": 3 }, 0)).toBe(3_000);
    expect(automationStudioRetryHintMs({ response: { headers: { "retry-after": "1.5" } } }, 0)).toBe(1_500);
    expect(automationStudioRetryHintMs({ retryAfterMs: 400 }, 0)).toBe(400);
  });

  it("reads a date as the wait until that instant", () => {
    const now = Date.parse("2026-09-26T12:00:00Z");

    expect(automationStudioRetryHintMs({ "retry-after": "Sat, 26 Sep 2026 12:00:05 GMT" }, now)).toBe(5_000);
    // An instant already past asks for no wait rather than a negative one.
    expect(automationStudioRetryHintMs({ "retry-after": "Sat, 26 Sep 2026 11:59:55 GMT" }, now)).toBe(0);
  });

  it("clamps a hint rather than handing a remote service the clock of the run", () => {
    expect(automationStudioRetryHintMs({ "retry-after": 3_600 }, 0)).toBe(AUTOMATION_STUDIO_MAX_RETRY_HINT_MS);
  });

  it("asks for no wait when nothing readable is there", () => {
    expect(automationStudioRetryHintMs({ "retry-after": "whenever" }, 0)).toBeUndefined();
    expect(automationStudioRetryHintMs(undefined, 0)).toBeUndefined();
    expect(automationStudioRetryHintMs({ "retry-after": -5 }, 0)).toBeUndefined();
  });
});
