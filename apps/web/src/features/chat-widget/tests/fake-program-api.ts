// Test support: a `ProgramCommandTransport` that records every request and
// answers from a table of endpoints, the way the web route would.

import type { ApiResponse, JsonObject } from "../../programs/program-api";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";

export type RecordedCall = { method: "get" | "post"; endpoint: string; payload: JsonObject | undefined };
export type Answer = ApiResponse<unknown> | ((payload: JsonObject | undefined) => ApiResponse<unknown>);

export type FakeProgramApi = ProgramCommandTransport & {
  calls: RecordedCall[];
  /** The payloads sent to `endpoint`, in order. */
  sentTo(endpoint: string): Array<JsonObject | undefined>;
  answer(endpoint: string, answer: Answer): void;
};

/** An endpoint nobody answered fails the way the panel's API does when it cannot be reached. */
const UNANSWERED: ApiResponse<unknown> = { ok: false, status: 0, code: "request_failed", error: "Program request could not be completed." };

export function fakeProgramApi(answers: Record<string, Answer> = {}): FakeProgramApi {
  const table = new Map<string, Answer>(Object.entries(answers));
  const calls: RecordedCall[] = [];
  const respond = async <T,>(method: "get" | "post", endpoint: string, payload: JsonObject | undefined): Promise<ApiResponse<T>> => {
    calls.push({ method, endpoint, payload });
    const answer = table.get(endpoint);
    return (typeof answer === "function" ? answer(payload) : answer ?? UNANSWERED) as ApiResponse<T>;
  };
  return {
    calls,
    sentTo: (endpoint) => calls.filter((call) => call.endpoint === endpoint).map((call) => call.payload),
    answer: (endpoint, answer) => void table.set(endpoint, answer),
    get: (endpoint) => respond("get", endpoint, undefined),
    post: (endpoint, payload) => respond("post", endpoint, payload)
  };
}
