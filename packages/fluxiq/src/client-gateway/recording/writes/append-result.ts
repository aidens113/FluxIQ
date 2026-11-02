/** A confirmed closed recording loses the entry explicitly; it was never stored. */
export type RecordingAppendResult<T> =
  | { kind: "appended"; value: T }
  | { kind: "discarded"; cause: unknown };
