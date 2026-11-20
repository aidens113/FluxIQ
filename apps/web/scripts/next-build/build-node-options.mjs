import { BUILD_HEAP_MB } from "./build-heap-mb.mjs";

const HEAP_FLAG = /(^|\s)--max[-_]old[-_]space[-_]size(=|\s)/u;

/**
 * The `NODE_OPTIONS` value Next's build workers inherit: the caller's own value
 * with the build heap appended, unless the caller already chose a heap size.
 * @param {string | undefined} existing
 * @returns {string}
 */
export function buildNodeOptions(existing) {
  const current = (existing ?? "").trim();
  if (HEAP_FLAG.test(current)) return current;
  const flag = `--max-old-space-size=${BUILD_HEAP_MB}`;
  return current === "" ? flag : `${current} ${flag}`;
}
