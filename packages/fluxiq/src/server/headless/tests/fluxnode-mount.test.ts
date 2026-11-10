// Where the FluxNode API is mounted: the program API listener serves it under
// /api/fluxnode/v1 only when given a service, and the program route is untouched either way.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FluxIQ } from "../../../framework/index.ts";
import { callApi } from "../../fluxnode-api/tests/call-api.ts";
import { createFakeFluxNodeService } from "../../fluxnode-api/tests/fake-fluxnode-service.ts";
import { programApiListener } from "../program-api-listener.ts";

// A path that is not an endpoint is answered before the instance is touched, so a stub stands in for it.
const STUB = { fluxiq: {} as FluxIQ };

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

describe("the FluxNode API mount", () => {
  const service = createFakeFluxNodeService();
  const withService = createServer(programApiListener(STUB, service));
  const without = createServer(programApiListener(STUB));
  let withPort = 0;
  let withoutPort = 0;

  beforeAll(async () => {
    withPort = await listen(withService);
    withoutPort = await listen(without);
  });

  afterAll(async () => {
    await Promise.all([withService, without].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("serves FluxNode paths when given a service, and keeps the program route's own 404 for other paths", async () => {
    const run = await callApi({ port: withPort, path: "/api/fluxnode/v1/runs/run_1" });
    expect(run.status).toBe(200);
    expect(service.calls.at(-1)?.method).toBe("get");
    const unknown = await callApi({ port: withPort, path: "/api/fluxnode/v1x/runs" });
    expect(unknown.status).toBe(404);
    expect(unknown.json()).toEqual({ ok: false, error: "Not found" });
  });

  it("guards FluxNode calls on the shared listener", async () => {
    const calls = service.calls.length;
    const reply = await callApi({ port: withPort, path: "/api/fluxnode/v1/runs/run_1", headers: { origin: "http://x.example" } });
    expect(reply.status).toBe(403);
    expect(service.calls.length).toBe(calls);
  });

  it("answers FluxNode paths 404 without a service", async () => {
    for (const path of ["/api/fluxnode/v1/runs", "/api/fluxnode/v1/runs/run_1", "/api/fluxnode/v1"]) {
      const reply = await callApi({ port: withoutPort, path });
      expect(reply.status).toBe(404);
      expect(reply.json()).toEqual({ ok: false, error: "Not found" });
    }
  });

  it("still routes the program path to the program route", async () => {
    // Wrong method is answered by the route's own matcher, which proves the program path is still claimed there.
    const reply = await callApi({ port: withPort, method: "DELETE", path: "/api/programs/demo/ping" });
    expect(reply.status).toBe(405);
    expect(reply.headers.allow).toBe("GET, POST");
    expect(reply.json()).toEqual({ ok: false, error: "Method not allowed" });
  });
});
