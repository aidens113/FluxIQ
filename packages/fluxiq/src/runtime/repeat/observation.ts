/**
 * Private equality evidence derived from an accepted host capture. Tokens
 * belong to the running frame only, never to a trace, snapshot summary or
 * model context. They grant no permission and establish no effect certainty.
 */
export type AutomationStudioRuntimeRepeatObservation =
  | {
      kind: "observed";
      /** Positive coverage of the relevant state and subject in this resource. */
      coverage: "complete";
      /** Opaque resource/document incarnation; equivalent content is not identity. */
      resource: string;
      /** A positively identified subject, or an explicitly targetless operation. */
      target: { kind: "none" } | { kind: "identified"; key: string };
      /** Comparable semantic state, independent of capture IDs and timestamps. */
      viewDigest: string;
    }
  | {
      kind: "unavailable";
      reason: "missing" | "partial" | "unreadable" | "unsupported";
    };
