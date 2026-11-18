import type { Duplex } from "node:stream";
import { SmtpEmailDeliveryError } from "./error.ts";
import type { SmtpReply } from "./types.ts";

const REPLY_LINE = /^(\d{3})([ -])(.*)$/u;

/**
 * Reads SMTP replies off a stream, one complete (possibly multi-line) reply
 * per `next()`. `attach` moves it to a new stream, which is how STARTTLS
 * hands the conversation from the plain socket to the TLS one. A closed or
 * failed stream fails the waiting read as a transport error; a line that is
 * not a reply fails it as a response error.
 */
export class SmtpReplyReader {
  private pending = "";
  private current: string[] = [];
  private currentCode: number | null = null;
  private readonly ready: SmtpReply[] = [];
  private waiter: { resolve: (reply: SmtpReply) => void; reject: (error: Error) => void } | null = null;
  private failure: SmtpEmailDeliveryError | null = null;
  private detach: (() => void) | null = null;

  attach(stream: Duplex): void {
    this.release();
    const onData = (chunk: Buffer | string) => this.push(typeof chunk === "string" ? chunk : chunk.toString("latin1"));
    const onClosed = () => this.fail(new SmtpEmailDeliveryError("platform.email.transport"));
    stream.on("data", onData);
    stream.on("error", onClosed);
    stream.on("end", onClosed);
    stream.on("close", onClosed);
    this.detach = () => {
      stream.off("data", onData);
      stream.off("error", onClosed);
      stream.off("end", onClosed);
      stream.off("close", onClosed);
    };
  }

  /** Stops listening to the current stream, before it is handed to TLS or closed. */
  release(): void {
    this.detach?.();
    this.detach = null;
  }

  next(): Promise<SmtpReply> {
    const reply = this.ready.shift();
    if (reply !== undefined) return Promise.resolve(reply);
    if (this.failure !== null) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => { this.waiter = { resolve, reject }; });
  }

  private push(text: string): void {
    this.pending += text;
    for (let end = this.pending.indexOf("\r\n"); end !== -1; end = this.pending.indexOf("\r\n")) {
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 2);
      this.line(line);
      if (this.failure !== null) return;
    }
  }

  private line(line: string): void {
    const match = REPLY_LINE.exec(line);
    const code = match ? Number(match[1]) : Number.NaN;
    if (!match || (this.currentCode !== null && code !== this.currentCode)) {
      this.fail(new SmtpEmailDeliveryError("platform.email.response"));
      return;
    }
    this.currentCode = code;
    this.current.push(match[3] ?? "");
    if (match[2] === "-") return;
    const reply = { code, lines: this.current };
    this.current = [];
    this.currentCode = null;
    const waiter = this.waiter;
    this.waiter = null;
    if (waiter) waiter.resolve(reply);
    else this.ready.push(reply);
  }

  private fail(error: SmtpEmailDeliveryError): void {
    if (this.failure !== null) return;
    this.failure = error;
    this.release();
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(error);
  }
}
