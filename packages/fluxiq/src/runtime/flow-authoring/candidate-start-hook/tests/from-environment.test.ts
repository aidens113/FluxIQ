// The candidate start hook built from deployment configuration (t348, D1):
// unset is no hook; a half-set or malformed configuration refuses as the host
// starts; a set hook POSTs an empty JSON object with the deployment's bearer
// token and answers the object the endpoint returned. The token never appears
// in an error.

import { describe, expect, it, vi } from "vitest";
import { AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV, automationStudioCandidateStartHookFromEnvironment } from "../index.ts";

const TOKEN = "lab-run-token-0123456789";
const ENDPOINT = "http://127.0.0.1:41234/__control/reset";
const env = (values: Record<string, string | undefined>) => ({ [AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV.endpoint]: values.endpoint, [AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV.token]: values.token });
const input = (signal = new AbortController().signal) => ({ projectId: "project.one", flowId: "flow.one", candidateId: "candidate.one", revision: 2, digest: "sha256:abc", signal });
const answering = (status: number, body: string) => vi.fn(async (_target: string | URL | Request, _init?: RequestInit) => new Response(body, { status, headers: { "content-type": "application/json" } }));

describe("automationStudioCandidateStartHookFromEnvironment", () => {
  it("names the two variables the deployment sets", () => {
    expect(AUTOMATION_STUDIO_CANDIDATE_START_HOOK_ENV).toEqual({ endpoint: "FLUXIQ_CANDIDATE_START_URL", token: "FLUXIQ_CANDIDATE_START_TOKEN" });
  });

  it("gives no hook when nothing is set, as in every product deployment", () => {
    expect(automationStudioCandidateStartHookFromEnvironment({})).toBeUndefined();
    expect(automationStudioCandidateStartHookFromEnvironment(env({ endpoint: "  ", token: "" }))).toBeUndefined();
  });

  it("refuses a token without an endpoint, and an endpoint that is not a plain http(s) address", () => {
    expect(() => automationStudioCandidateStartHookFromEnvironment(env({ token: TOKEN }))).toThrow(/FLUXIQ_CANDIDATE_START_TOKEN is set without FLUXIQ_CANDIDATE_START_URL/u);
    for (const endpoint of ["not an address", "file:///etc/passwd", "ftp://127.0.0.1/reset", "http://user:secret@127.0.0.1/reset"]) {
      let thrown: unknown;
      try { automationStudioCandidateStartHookFromEnvironment(env({ endpoint, token: TOKEN })); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toMatch(/FLUXIQ_CANDIDATE_START_URL must be an absolute http or https address/u);
      expect((thrown as Error).message).not.toContain(TOKEN);
    }
  });

  it("POSTs an empty JSON object with the bearer token and answers the endpoint's object", async () => {
    const send = answering(200, JSON.stringify({ status: "reset", seed: 1, provenance: { resetGeneration: 3 } }));
    const hook = automationStudioCandidateStartHookFromEnvironment(env({ endpoint: ENDPOINT, token: TOKEN }), { fetch: send });
    expect(hook).toBeTypeOf("function");
    await expect(hook!(input())).resolves.toEqual({ status: "reset", seed: 1, provenance: { resetGeneration: 3 } });
    expect(send).toHaveBeenCalledOnce();
    const [target, init] = send.mock.calls[0]!;
    expect(target).toBe(ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ "content-type": "application/json", accept: "application/json", authorization: `Bearer ${TOKEN}` });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no authorization header when only the endpoint is set", async () => {
    const send = answering(200, "{}");
    await automationStudioCandidateStartHookFromEnvironment(env({ endpoint: ENDPOINT }), { fetch: send })!(input());
    expect(send.mock.calls[0]![1]?.headers).toEqual({ "content-type": "application/json", accept: "application/json" });
  });

  it("throws, without the token, on a refusal, a non-object answer or an oversized answer", async () => {
    const cases: Array<[number, string, RegExp]> = [
      [401, JSON.stringify({ error: "unauthorized" }), /answered HTTP 401/u],
      [200, "[1,2]", /other than a JSON object/u],
      [200, "null", /other than a JSON object/u],
      [200, "<html>", /other than JSON/u],
      [200, JSON.stringify({ padding: "x".repeat(17 * 1024) }), /more than it may record/u],
    ];
    for (const [status, body, message] of cases) {
      const hook = automationStudioCandidateStartHookFromEnvironment(env({ endpoint: ENDPOINT, token: TOKEN }), { fetch: answering(status, body) })!;
      const failure = await hook(input()).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(message);
      expect((failure as Error).message).not.toContain(TOKEN);
    }
  });

  it("stops waiting when the trial is cancelled", async () => {
    const send = vi.fn((_target: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const controller = new AbortController();
    const pending = automationStudioCandidateStartHookFromEnvironment(env({ endpoint: ENDPOINT, token: TOKEN }), { fetch: send })!(input(controller.signal));
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("times out a start that never answers", async () => {
    const send = vi.fn((_target: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const pending = automationStudioCandidateStartHookFromEnvironment(env({ endpoint: ENDPOINT }), { fetch: send, timeoutMs: 5 })!(input());
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  });
});
