import { describe, expect, it, vi } from "vitest";
import { programJsonText } from "../program-json-text.ts";

describe("programJsonText", () => {
  it("writes an answer as JSON with its status", () => {
    expect(programJsonText("automation-studio", "list-conversations", { ok: true, payload: { items: [] } }, 200)).toEqual({ status: 200, text: "{\"ok\":true,\"payload\":{\"items\":[]}}" });
  });

  it("answers 500 with a reason when the body cannot be written as JSON", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const written = programJsonText("automation-studio", "list-runtime-sessions", cyclic, 200);
    expect(written.status).toBe(500);
    expect(JSON.parse(written.text)).toMatchObject({ ok: false, errorCode: "response.unserializable" });
    error.mockRestore();
  });
});
