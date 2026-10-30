import { redactFields } from "./redact-fields";
import type { CreateLoggerOptions, LogFields, Logger, LogLevel, LogSink } from "./types";

const consoleSink: LogSink = (level, line) => console[level](line);

/**
 * A logger that redacts secret-looking keys. `json` writes one JSON object per
 * line (`time`, `level`, `msg` and the redacted fields); `text` writes the
 * message as it always was, with any fields appended as `key=value`.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? Date.now;
  const write = (level: LogLevel, message: string, fields: LogFields | undefined) => {
    const safe = fields === undefined ? {} : redactFields(fields);
    if (options.format === "json") {
      // The line's own keys come last, so a field named msg cannot replace the message.
      sink(level, JSON.stringify({ ...safe, time: new Date(now()).toISOString(), level, msg: message }));
      return;
    }
    const tail = Object.entries(safe).map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    sink(level, tail.length === 0 ? message : `${message} ${tail.join(" ")}`);
  };
  return {
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields)
  };
}
