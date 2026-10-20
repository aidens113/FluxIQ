// The bounds of content-defined chunking for persisted gateway trace events
// (trace-offline-trials-plan, lane T P3). P2 measured stored event JSON at
// 92-96% of a trace's bytes: action results and state updates carry the same
// views from command to command, mostly near-identical. Cutting each event's
// JSON where its content says (not at fixed offsets) lets an insertion or an
// edit change only the chunks around it, so the rest are stored once.
//
// The cut rule is a gear rolling hash with FastCDC's normalized chunking: before
// the average size a cut needs the hash's top 14 bits clear (rarer), after it
// the top 10 (likelier), which pulls chunk sizes toward the average. High bits
// are tested because a gear hash's bit k depends only on the last k + 1 bytes.
// Changing any of these values changes where cuts fall, so chunks written
// before and after would stop sharing: change them only with a measurement
// (`tests/store-chunk-measure.test.ts`). On its 220-event trace (2026-10-20) a
// 4 KiB average kept 4.5% of the 0030 bytes and an 8 KiB average 6.1%.

export const GATEWAY_TRACE_CHUNK_BOUNDS = Object.freeze({
  /** Event JSON shorter than this many UTF-8 bytes stays inline in its row. */
  inlineBelowBytes: 16 * 1024,
  /** No cut before this many bytes of a chunk. */
  minBytes: 1 * 1024,
  /** Where the cut rule loosens; the chunk size the rule aims at. */
  averageBytes: 4 * 1024,
  /** A chunk is cut here whatever the hash says. */
  maxBytes: 64 * 1024,
  /** Top 14 bits: the cut test before the average size. */
  strictMask: 0xfffc0000,
  /** Top 10 bits: the cut test from the average size on. */
  looseMask: 0xffc00000
});
