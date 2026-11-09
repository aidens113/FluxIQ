// JSON Pointer (RFC 6901) formatting, the one path notation every FluxNode issue and
// validation error uses.

/**
 * Formats steps into a JSON Pointer: `["listings", 0, "price"]` is
 * `/listings/0/price`, and no steps is `""`, the whole value. `~` and `/` inside a
 * key are escaped as `~0` and `~1`.
 */
export function formatJsonPointer(path: ReadonlyArray<string | number>): string {
  let pointer = "";
  for (const step of path) {
    const text = typeof step === "number" ? String(step) : step.replaceAll("~", "~0").replaceAll("/", "~1");
    pointer += `/${text}`;
  }
  return pointer;
}
