// What the project store keeps for one persisted gateway trace, by name
// (trace-offline-trials-plan, lane T P3): its events, how each is held
// (inline JSON, a chunked body, or a 0030 content object), the chunks it uses
// and how many of those another trace shares, and its held artifacts. A Lab or
// an operator reads storage through this answer, never by opening the tables,
// so the layout can change behind it.

/** One trace's storage. Counts and byte lengths only: never a body, a digest or a payload. */
export type AutomationStudioGatewayTraceMeasure = {
  readonly traceId: string;
  readonly events: number;
  /** Every event's JSON, UTF-8: inline bytes + chunked bodies' lengths + 0030 object bytes. */
  readonly logicalEventBytes: number;
  readonly inlineEvents: number;
  /** UTF-8 bytes of the inline JSON kept in event rows. */
  readonly inlineBytes: number;
  readonly chunkedEvents: number;
  /** Total byte length of the chunked bodies. */
  readonly chunkedLogicalBytes: number;
  /** Bytes of the chunked rows' digest lists (32 per chunk reference). */
  readonly digestListBytes: number;
  /** 0030 events held as one content object each. */
  readonly objectEvents: number;
  /** Bytes those content objects hold; an object no longer there counts 0. */
  readonly objectBytes: number;
  /** Distinct chunks this trace uses. */
  readonly chunks: number;
  /** Their raw (unencoded) bytes. */
  readonly chunkRawBytes: number;
  /** Their bytes as stored (raw or deflated). A chunk is stored once per project, shared or not. */
  readonly storedChunkBytes: number;
  /** Of `chunks`, those another trace in the project also uses. */
  readonly sharedChunks: number;
  /** Stored bytes of `sharedChunks`. */
  readonly sharedStoredChunkBytes: number;
  /** Artifacts whose content is actually there (as `listArtifacts` reports them). */
  readonly artifacts: number;
  readonly artifactBytes: number;
};
