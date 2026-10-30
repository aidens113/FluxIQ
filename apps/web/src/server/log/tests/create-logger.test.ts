import { describe, expect, it } from "vitest";
import { createLogger, redactFields, type LogLevel } from "../index";

function capture(format: "text" | "json") {
  const lines: Array<{ level: LogLevel; line: string }> = [];
  const logger = createLogger({ format, sink: (level, line) => lines.push({ level, line }), now: () => Date.UTC(2026, 9, 29) });
  return { logger, lines };
}

describe("redacting logger", () => {
  it("writes the message unchanged in text format", () => {
    const { logger, lines } = capture("text");
    logger.info("[FluxIQ] Client gateway bound");
    logger.warn("[FluxIQ] careful", { port: 4777 });
    expect(lines).toEqual([
      { level: "info", line: "[FluxIQ] Client gateway bound" },
      { level: "warn", line: "[FluxIQ] careful port=4777" }
    ]);
  });

  it("writes one JSON object per line in json format", () => {
    const { logger, lines } = capture("json");
    logger.error("listener failed", { port: 4780, msg: "spoof" });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.line)).toEqual({ time: "2026-10-29T00:00:00.000Z", level: "error", msg: "listener failed", port: 4780 });
  });

  it.each(["token", "authToken", "Cookie", "setupCode", "client_secret", "password", "apiKey", "Authorization", "sessionId", "requestBody"])("drops the value of %s", (key) => {
    const { logger, lines } = capture("json");
    logger.info("x", { [key]: "hunter2-value", visible: "ok" });
    expect(lines[0]!.line).not.toContain("hunter2-value");
    expect(JSON.parse(lines[0]!.line)).toMatchObject({ [key]: "[redacted]", visible: "ok" });
  });

  it("redacts nested objects and arrays in both formats", () => {
    const fields = { request: { headers: { cookie: "abc-secret-1" }, list: [{ token: "abc-secret-2" }] } };
    expect(JSON.stringify(redactFields(fields))).not.toContain("abc-secret");
    const { logger, lines } = capture("text");
    logger.info("x", fields);
    expect(lines[0]!.line).not.toContain("abc-secret");
  });
});
