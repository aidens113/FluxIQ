// How the drift checks compare a generated file on disk with what the
// generator renders now. A checkout with `core.autocrlf=true` writes the files
// with CRLF line endings while git stores them with LF, so line endings are not
// content: both sides are compared with every CRLF read as LF. Any other
// difference, a line ending inside a string included, is still drift.

/** `text` with every CRLF line ending read as LF. */
export function withLfLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n");
}
