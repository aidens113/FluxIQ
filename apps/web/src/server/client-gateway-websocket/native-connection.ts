import type { Duplex } from "node:stream";
import type { ClientGatewaySocket } from "fluxiq/client-gateway";
import { encodeWebSocketFrame } from "./encode-frame.ts";
import { readWebSocketFrame, WEBSOCKET_MAX_HEADER_BYTES, type WebSocketFrame } from "./read-frame.ts";
import type { TokenBucket } from "./token-bucket.ts";

/** A limit a client broke; the connection is closed for it right after it is reported. */
export type NativeWebSocketViolation =
  | { kind: "frame_too_large"; declaredBytes: number }
  | { kind: "rate_limited" };

export type NativeWebSocketConnectionOptions = {
  socket: Duplex;
  /** The largest frame payload, pending buffer or reassembled message taken in, in bytes. */
  maxFrameBytes: number;
  /** The socket's message bucket, or null for no rate limit. */
  rateLimit: TokenBucket | null;
  onText(message: string): void | Promise<void>;
  onViolation(violation: NativeWebSocketViolation): void;
  onClose(): void;
};

// A refused socket is given this long to flush its close frame before it is destroyed.
const TERMINATE_FLUSH_MS = 1000;
const OPCODE = { continuation: 0, text: 1, binary: 2, close: 8, ping: 9, pong: 10 } as const;

/**
 * The server side of one RFC 6455 connection, as a gateway socket. A frame
 * whose declared length is beyond `maxFrameBytes`, and a fragmented message
 * that grows beyond it, close the socket with 1009 before the payload is
 * buffered; a message over the rate limit closes it with 1008.
 */
export class NativeWebSocketConnection implements ClientGatewaySocket {
  private buffer: Buffer = Buffer.alloc(0);
  private closed = false;
  private fragmentOpcode: number | null = null;
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;

  constructor(private readonly options: NativeWebSocketConnectionOptions) {
    options.socket.on("data", (chunk: Buffer) => this.acceptData(chunk));
    // The HTTP server's sockets allow half-open, so a client that leaves without a close frame would
    // otherwise keep the upgraded socket, its session and the listener's close waiting forever.
    options.socket.on("end", () => options.socket.destroy());
    options.socket.on("close", () => this.markClosed());
    options.socket.on("error", () => this.markClosed());
  }

  /** Whether the connection still takes frames in and sends them out. */
  get open(): boolean {
    return !this.closed;
  }

  acceptData(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    while (!this.closed) {
      const read = readWebSocketFrame(this.buffer, this.options.maxFrameBytes);
      if (read.kind === "incomplete") break;
      if (read.kind === "too_large") {
        this.refuse({ kind: "frame_too_large", declaredBytes: read.declaredBytes }, 1009, "frame too large");
        return;
      }
      this.buffer = this.buffer.subarray(read.frame.bytesRead);
      this.takeFrame(read.frame);
    }
    if (!this.closed && this.buffer.length > this.options.maxFrameBytes + WEBSOCKET_MAX_HEADER_BYTES) {
      this.refuse({ kind: "frame_too_large", declaredBytes: this.buffer.length }, 1009, "frame too large");
    }
  }

  send(message: string): void {
    this.writeFrame(OPCODE.text, Buffer.from(message, "utf8"));
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    this.writeFrame(OPCODE.close, closePayload(code, reason));
    this.closed = true;
    this.options.socket.end();
  }

  /** Closes with `code` and destroys the socket once the close frame is flushed; nothing more is read from it. */
  terminate(code: number, reason: string): void {
    if (this.closed) return;
    this.writeFrame(OPCODE.close, closePayload(code, reason));
    this.closed = true;
    this.buffer = Buffer.alloc(0);
    this.fragments = [];
    const { socket } = this.options;
    const timer = setTimeout(() => socket.destroy(), TERMINATE_FLUSH_MS);
    timer.unref();
    socket.end(() => {
      clearTimeout(timer);
      socket.destroy();
    });
  }

  private refuse(violation: NativeWebSocketViolation, code: number, reason: string): void {
    this.options.onViolation(violation);
    this.terminate(code, reason);
  }

  private takeFrame(frame: WebSocketFrame): void {
    if (frame.opcode === OPCODE.close) {
      this.close();
      return;
    }
    const counted = frame.opcode === OPCODE.ping || frame.opcode === OPCODE.pong || (frame.fin && frame.opcode <= OPCODE.binary);
    if (counted && this.options.rateLimit !== null && !this.options.rateLimit.take()) {
      this.refuse({ kind: "rate_limited" }, 1008, "rate limit exceeded");
      return;
    }
    if (frame.opcode === OPCODE.ping) {
      this.writeFrame(OPCODE.pong, frame.payload);
      return;
    }
    if (frame.opcode === OPCODE.pong) return;
    if (frame.opcode > OPCODE.binary) return;
    const message = this.collectFragment(frame);
    if (message?.opcode === OPCODE.text) void this.options.onText(message.payload.toString("utf8"));
  }

  private collectFragment(frame: WebSocketFrame): { opcode: number; payload: Buffer } | null {
    if (frame.opcode !== OPCODE.continuation && frame.fin) return { opcode: frame.opcode, payload: frame.payload };
    if (frame.opcode !== OPCODE.continuation) this.fragmentOpcode = frame.opcode;
    this.fragmentBytes += frame.payload.length;
    if (this.fragmentBytes > this.options.maxFrameBytes) {
      this.refuse({ kind: "frame_too_large", declaredBytes: this.fragmentBytes }, 1009, "message too large");
      return null;
    }
    this.fragments.push(frame.payload);
    if (!frame.fin) return null;
    const opcode = this.fragmentOpcode ?? frame.opcode;
    const payload = Buffer.concat(this.fragments);
    this.fragments = [];
    this.fragmentBytes = 0;
    this.fragmentOpcode = null;
    return { opcode, payload };
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    if (this.closed) return;
    this.options.socket.write(encodeWebSocketFrame(opcode, payload));
  }

  // Both a socket's `close` and its `error` end the connection; `onClose` hears each, and its owner keeps the first.
  private markClosed(): void {
    this.closed = true;
    this.options.onClose();
  }
}

function closePayload(code: number, reason: string): Buffer {
  const reasonBuffer = Buffer.from(reason, "utf8");
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return payload;
}
