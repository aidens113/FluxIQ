/** One decoded WebSocket frame, its payload unmasked. */
export type WebSocketFrame = {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  bytesRead: number;
};

/**
 * What the buffer holds: a whole frame, not enough bytes yet, or the header of
 * a frame whose declared payload is beyond the limit. The limit is judged from
 * the declared length alone, so an oversized frame is refused before any of
 * its payload is buffered.
 */
export type WebSocketFrameRead =
  | { kind: "frame"; frame: WebSocketFrame }
  | { kind: "incomplete" }
  | { kind: "too_large"; declaredBytes: number };

/** The longest frame header: 2 bytes, an 8-byte extended length and a 4-byte mask. */
export const WEBSOCKET_MAX_HEADER_BYTES = 14;

const INCOMPLETE: WebSocketFrameRead = Object.freeze({ kind: "incomplete" });

/** Reads the first frame in `buffer`, refusing one whose payload would exceed `maxPayloadBytes`. */
export function readWebSocketFrame(buffer: Buffer, maxPayloadBytes: number): WebSocketFrameRead {
  if (buffer.length < 2) return INCOMPLETE;
  const first = buffer[0]!;
  const second = buffer[1]!;
  const masked = (second & 0x80) !== 0;
  let payloadLength = second & 0x7f;
  let offset = 2;
  if (payloadLength === 126) {
    if (buffer.length < offset + 2) return INCOMPLETE;
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) return INCOMPLETE;
    const length = buffer.readBigUInt64BE(offset);
    if (length > BigInt(maxPayloadBytes)) {
      return { kind: "too_large", declaredBytes: length > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(length) };
    }
    payloadLength = Number(length);
    offset += 8;
  }
  if (payloadLength > maxPayloadBytes) return { kind: "too_large", declaredBytes: payloadLength };
  const maskOffset = offset;
  if (masked) offset += 4;
  if (buffer.length < offset + payloadLength) return INCOMPLETE;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) payload[index] = payload[index]! ^ mask[index % 4]!;
  }
  return { kind: "frame", frame: { fin: (first & 0x80) !== 0, opcode: first & 0x0f, payload, bytesRead: offset + payloadLength } };
}
