// A minimal RFC 6455 client for the transport tests: it sends any Origin and
// any headers, masks its frames, can declare a length it never sends, and
// reports the HTTP status and the close code it was given. Test support only.
import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import { readWebSocketFrame } from "../read-frame.ts";

export type RawServerMessage = { type: string; payload: Record<string, unknown> };

export type RawWebSocketClient = {
  /** The upgrade response's status: 101 when the socket was accepted. */
  status: number;
  /** The upgrade response's header block. */
  responseHead: string;
  messages: RawServerMessage[];
  sendText(text: string): void;
  sendJson(type: string, payload: Record<string, unknown>): void;
  /** Writes one masked frame; `declaredLength` larger than `payload` leaves the rest unsent. */
  sendFrame(input: { opcode: number; payload?: Buffer; fin?: boolean; declaredLength?: number }): void;
  nextMessage(type: string, timeoutMs?: number): Promise<RawServerMessage>;
  /** Resolves when the socket ends, with the close frame's code (null when none came). */
  closed: Promise<{ code: number | null; reason: string }>;
  destroy(): void;
};

export async function openRawWebSocket(input: { socket: Duplex; hostHeader: string; path: string; origin?: string; headers?: Record<string, string> }): Promise<RawWebSocketClient> {
  const { socket } = input;
  const headers: Record<string, string> = {
    Host: input.hostHeader,
    Upgrade: "websocket",
    Connection: "Upgrade",
    "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
    "Sec-WebSocket-Version": "13",
    ...(input.origin !== undefined ? { Origin: input.origin } : {}),
    ...input.headers
  };
  socket.write(`GET ${input.path} HTTP/1.1\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("")}\r\n`);

  const messages: RawServerMessage[] = [];
  const waiters: Array<{ type: string; resolve(message: RawServerMessage): void }> = [];
  let closeCode: number | null = null;
  let closeReason = "";
  let buffer = Buffer.alloc(0);
  let head: { status: number; text: string } | null = null;
  let resolveHead: (value: { status: number; text: string }) => void = () => undefined;
  const headReady = new Promise<{ status: number; text: string }>((resolve) => { resolveHead = resolve; });
  const closed = new Promise<{ code: number | null; reason: string }>((resolve) => {
    socket.on("close", () => {
      if (head === null) resolveHead({ status: 0, text: "" });
      resolve({ code: closeCode, reason: closeReason });
    });
  });
  socket.on("error", () => undefined);
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (head === null) {
      const end = buffer.indexOf("\r\n\r\n");
      if (end < 0) return;
      const text = buffer.subarray(0, end).toString("latin1");
      head = { status: Number(text.split(" ")[1]), text };
      buffer = buffer.subarray(end + 4);
      resolveHead(head);
    }
    for (;;) {
      const read = readWebSocketFrame(buffer, Number.MAX_SAFE_INTEGER);
      if (read.kind !== "frame") break;
      buffer = buffer.subarray(read.frame.bytesRead);
      if (read.frame.opcode === 8) {
        closeCode = read.frame.payload.length >= 2 ? read.frame.payload.readUInt16BE(0) : null;
        closeReason = read.frame.payload.subarray(2).toString("utf8");
      } else if (read.frame.opcode === 1) {
        const message = JSON.parse(read.frame.payload.toString("utf8")) as RawServerMessage;
        messages.push(message);
        for (const waiter of waiters.filter((candidate) => candidate.type === message.type)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.resolve(message);
        }
      }
    }
  });

  const sendFrame: RawWebSocketClient["sendFrame"] = ({ opcode, payload = Buffer.alloc(0), fin = true, declaredLength = payload.length }) => {
    socket.write(maskedFrame(opcode, payload, fin, declaredLength));
  };
  const resolved = await headReady;
  return {
    status: resolved.status,
    responseHead: resolved.text,
    messages,
    sendText: (text) => sendFrame({ opcode: 1, payload: Buffer.from(text, "utf8") }),
    sendJson: (type, payload) => sendFrame({ opcode: 1, payload: Buffer.from(JSON.stringify({ id: `test-${randomBytes(4).toString("hex")}`, type, protocolVersion: "0.1", timestamp: Date.now(), payload }), "utf8") }),
    sendFrame,
    nextMessage: (type, timeoutMs = 5000) => {
      const seen = messages.find((message) => message.type === type);
      if (seen) return Promise.resolve(seen);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`No ${type} within ${timeoutMs} ms.`)), timeoutMs);
        waiters.push({
          type,
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message);
          }
        });
      });
    },
    closed,
    destroy: () => socket.destroy()
  };
}

function maskedFrame(opcode: number, payload: Buffer, fin: boolean, declaredLength: number): Buffer {
  const lengthBytes = declaredLength < 126 ? 0 : declaredLength <= 0xffff ? 2 : 8;
  const header = Buffer.alloc(2 + lengthBytes + 4);
  header[0] = (fin ? 0x80 : 0) | opcode;
  if (lengthBytes === 0) header[1] = 0x80 | declaredLength;
  else if (lengthBytes === 2) {
    header[1] = 0x80 | 126;
    header.writeUInt16BE(declaredLength, 2);
  } else {
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(declaredLength), 2);
  }
  const mask = randomBytes(4);
  mask.copy(header, 2 + lengthBytes);
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index += 1) masked[index] = masked[index]! ^ mask[index % 4]!;
  return Buffer.concat([header, masked]);
}
