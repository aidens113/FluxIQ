import { createServer, type IncomingMessage, type Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID, createHash } from "node:crypto";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayService, type ClientGatewaySocket } from "fluxiq/client-gateway";

export type ClientGatewayWebSocketServerOptions = {
  gateway: ClientGatewayService;
  host?: string;
  port?: number;
  path?: string;
  allowedOrigins?: string[];
};

export type ClientGatewayWebSocketServerHandle = {
  server: HttpServer;
  host: string;
  port: number;
  path: string;
  publicUrl: string;
  status: { listening: boolean; error?: string };
  close(): Promise<void>;
};

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export function startClientGatewayWebSocketServer(options: ClientGatewayWebSocketServerOptions): ClientGatewayWebSocketServerHandle {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4777;
  const path = normalizePath(options.path ?? "/client");
  if (!isLoopbackHost(host) && (!options.allowedOrigins?.length || options.allowedOrigins.includes("*"))) {
    throw new Error("A restrictive FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS list is required when the client gateway binds beyond loopback.");
  }
  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const publicUrl = `ws://${publicHost}:${port}${path}`;
  const status: ClientGatewayWebSocketServerHandle["status"] = { listening: false };
  const server = createServer((request, response) => {
    const requestPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      ok: true,
      service: "fluxiq-client-gateway",
      websocketPath: path,
      publicUrl,
      listening: status.listening,
      error: status.error ?? null,
      accepts: requestPath === path ? "websocket-upgrade" : "health"
    }));
  });

  server.on("upgrade", (request, socket, head) => {
    const requestPath = request.url ? new URL(request.url, "http://localhost").pathname : "/";
    if (requestPath !== path) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (!isOriginAllowed(request.headers.origin, options.allowedOrigins)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    if (options.gateway.snapshot().enabled === false) {
      rejectUpgrade(socket, 503, "Client Gateway Disabled");
      return;
    }
    acceptClientGatewaySocket({ gateway: options.gateway, request, socket, head });
  });
  server.on("error", (error: NodeJS.ErrnoException) => {
    status.listening = false;
    status.error = error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the old FluxIQ dev server or change FLUXIQ_CLIENT_GATEWAY_PORT.`
      : error.message;
    console.warn(`[FluxIQ] Client gateway WebSocket server error: ${error.message}`);
  });
  server.on("listening", () => {
    status.listening = true;
    delete status.error;
  });

  server.listen(port, host);

  return {
    server,
    host,
    port,
    path,
    publicUrl,
    status,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

export function parseAllowedOrigins(value?: string): string[] | undefined {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins?.length ? origins : undefined;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins?: string[]): boolean {
  if (!allowedOrigins?.length || allowedOrigins.includes("*")) return true;
  if (!origin) return false;
  return allowedOrigins.includes(origin);
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function acceptClientGatewaySocket(input: {
  gateway: ClientGatewayService;
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
}): void {
  const key = input.request.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    rejectUpgrade(input.socket, 400, "Missing WebSocket Key");
    return;
  }

  const accept = createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
  input.socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    ""
  ].join("\r\n"));

  let sessionId = "";
  let disconnected = false;
  const connection = new NativeWebSocketConnection(input.socket, async (message) => {
    try {
      await input.gateway.receiveRaw(sessionId, message);
    } catch (error) {
      await connection.send(JSON.stringify(serverError(error instanceof Error ? error.message : "Invalid client gateway message.")));
    }
  }, () => {
    if (disconnected || !sessionId) return;
    disconnected = true;
    input.gateway.disconnect(sessionId, "socket closed");
  });
  const session = input.gateway.connect({ socket: connection });
  sessionId = session.sessionId;
  if (input.head.length) connection.acceptData(input.head);
}

class NativeWebSocketConnection implements ClientGatewaySocket {
  private buffer = Buffer.alloc(0);
  private closed = false;
  private fragmentOpcode: number | null = null;
  private fragments: Buffer[] = [];

  constructor(
    private readonly socket: Duplex,
    private readonly onText: (message: string) => void | Promise<void>,
    private readonly onClose: () => void
  ) {
    this.socket.on("data", (chunk: Buffer) => this.acceptData(chunk));
    this.socket.on("close", () => {
      this.closed = true;
      this.onClose();
    });
    this.socket.on("error", () => {
      this.closed = true;
      this.onClose();
    });
  }

  acceptData(chunk: Buffer): void {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const frame = readFrame(this.buffer);
      if (!frame) return;
      this.buffer = this.buffer.subarray(frame.bytesRead);
      void this.handleFrame(frame);
    }
  }

  send(message: string): void {
    this.writeFrame(1, Buffer.from(message, "utf8"));
  }

  close(code = 1000, reason = ""): void {
    if (this.closed) return;
    const reasonBuffer = Buffer.from(reason, "utf8");
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.writeFrame(8, payload);
    this.closed = true;
    this.socket.end();
  }

  private async handleFrame(frame: WebSocketFrame): Promise<void> {
    if (frame.opcode === 8) {
      this.close();
      return;
    }
    if (frame.opcode === 9) {
      this.writeFrame(10, frame.payload);
      return;
    }
    if (frame.opcode === 10) return;
    if (frame.opcode === 1 || frame.opcode === 2 || frame.opcode === 0) {
      const message = this.collectFragment(frame);
      if (!message) return;
      if (message.opcode === 1) await this.onText(message.payload.toString("utf8"));
    }
  }

  private collectFragment(frame: WebSocketFrame): { opcode: number; payload: Buffer } | null {
    if (frame.opcode !== 0 && frame.fin) return { opcode: frame.opcode, payload: frame.payload };
    if (frame.opcode !== 0) this.fragmentOpcode = frame.opcode;
    this.fragments.push(frame.payload);
    if (!frame.fin) return null;
    const opcode = this.fragmentOpcode ?? frame.opcode;
    const payload = Buffer.concat(this.fragments);
    this.fragments = [];
    this.fragmentOpcode = null;
    return { opcode, payload };
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    if (this.closed && opcode !== 8) return;
    const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
    const header = Buffer.alloc(headerLength);
    header[0] = 0x80 | opcode;
    if (payload.length < 126) {
      header[1] = payload.length;
    } else if (payload.length <= 0xffff) {
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }
}

type WebSocketFrame = {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  bytesRead: number;
};

function readFrame(buffer: Buffer): WebSocketFrame | null {
  const first = buffer[0]!;
  const second = buffer[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let payloadLength = second & 0x7f;
  let offset = 2;
  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return null;
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("WebSocket frame is too large.");
    payloadLength = Number(length);
    offset += 8;
  }
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + payloadLength) return null;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) payload[index] = payload[index]! ^ mask[index % 4]!;
  }
  return { fin, opcode, payload, bytesRead: offset + payloadLength };
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function serverError(message: string) {
  return {
    id: randomUUID(),
    type: "server.error",
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload: { message, code: "gateway.receive_failed" }
  };
}
