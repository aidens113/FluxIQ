import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";

/** A domain may project target data; recording identity and execution rights stay with Core. */
export type RecordingEntryTargetPreparer = (
  domainId: string,
  entry: Readonly<Extract<AppendRecordingEntryInput, { type: "action" }>>
) => Pick<Extract<AppendRecordingEntryInput, { type: "action" }>, "parameters" | "target"> | null;
