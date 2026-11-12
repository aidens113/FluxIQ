/**
 * A managed browser host a launcher started. `close` ends the browser and
 * everything it started, leaving no process behind; `closed` settles when the
 * browser goes away for any reason, including a crash.
 */
export type FluxIQLaunchedHost = {
  hostId: string;
  close(): Promise<void>;
  closed: Promise<void>;
};
