/** An opaque page cursor: where the next page starts. */
export function encodePartCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

/** The offset a cursor names. A cursor this store did not mint starts the page at the top. */
export function decodePartCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof value.o === "number" && Number.isInteger(value.o) && value.o >= 0 ? value.o : 0;
  } catch (error) {
    if (error instanceof SyntaxError) return 0;
    throw error;
  }
}
