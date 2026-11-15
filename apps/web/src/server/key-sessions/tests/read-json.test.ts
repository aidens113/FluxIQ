import { describe, expect, it } from "vitest";
import { readKeyJson } from "../read-json";

const request = (body: string, type = "application/json") => new Request("https://app.example.test/api/keys/session", { method: "POST", headers: { "content-type": type }, body });

describe("bounded key JSON", () => {
  it("accepts JSON with charset", async () => expect(await readKeyJson(request('{"v":1}', "application/json; charset=utf-8"))).toEqual({ v: 1 }));
  it("rejects malformed, wrong-type and oversized requests", async () => {
    await expect(readKeyJson(request("{"))).rejects.toThrow();
    await expect(readKeyJson(request("{}", "text/plain"))).rejects.toThrow();
    await expect(readKeyJson(request(JSON.stringify({ value: "x".repeat(16_384) })))).rejects.toThrow();
  });
  it("limits accumulated chunked bytes without relying on content length", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10_000));
        controller.enqueue(new Uint8Array(10_000));
      },
      cancel() { canceled = true; }
    });
    const value = new Request("https://app.example.test", { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    await expect(readKeyJson(value)).rejects.toThrow();
    expect(canceled).toBe(true);
  });
});
