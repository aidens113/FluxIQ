import { describe, expect, it } from "vitest";
import { encodeWebSocketFrame } from "../encode-frame.ts";
import { readWebSocketFrame } from "../read-frame.ts";

describe("readWebSocketFrame", () => {
  it("reads a whole frame and waits for an incomplete one", () => {
    const frame = encodeWebSocketFrame(1, Buffer.from("hello"));
    const read = readWebSocketFrame(frame, 1024);
    expect(read.kind).toBe("frame");
    if (read.kind === "frame") expect(read.frame.payload.toString()).toBe("hello");
    expect(readWebSocketFrame(frame.subarray(0, 4), 1024).kind).toBe("incomplete");
  });

  it("refuses a frame from its declared length before the payload arrives", () => {
    const header16 = Buffer.from([0x81, 0xfe, 0x08, 0x00]);
    expect(readWebSocketFrame(header16, 1024)).toEqual({ kind: "too_large", declaredBytes: 2048 });
    const header64 = Buffer.alloc(10);
    header64[0] = 0x82;
    header64[1] = 127;
    header64.writeBigUInt64BE(2n ** 63n, 2);
    expect(readWebSocketFrame(header64, 1024)).toEqual({ kind: "too_large", declaredBytes: Number.MAX_SAFE_INTEGER });
  });

  it("takes a frame exactly at the limit", () => {
    expect(readWebSocketFrame(encodeWebSocketFrame(2, Buffer.alloc(300)), 300).kind).toBe("frame");
  });
});
