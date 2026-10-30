/** Structured values a log line may carry besides its message. */
export type LogFields = Readonly<Record<string, unknown>>;

export type LogLevel = "info" | "warn" | "error";

/** Where a finished line goes: one string per call, no trailing newline. */
export type LogSink = (level: LogLevel, line: string) => void;

export type Logger = {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export type CreateLoggerOptions = {
  format: "text" | "json";
  /** Defaults to `console.info`, `console.warn` and `console.error`. */
  sink?: LogSink;
  /** The clock for the JSON `time` field. */
  now?: () => number;
};
