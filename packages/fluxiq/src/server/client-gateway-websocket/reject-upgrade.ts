import type { Duplex } from "node:stream";

/** Answers an upgrade with a plain HTTP status and closes the socket. */
export function rejectUpgrade(socket: Duplex, statusCode: number, message: string, headers: Readonly<Record<string, string>> = {}): void {
  const extra = Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join("");
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\n${extra}Connection: close\r\n\r\n`);
  socket.destroy();
}
