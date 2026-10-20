// The flush policy of one episode's trace: the recorder holds events in memory
// until it is flushed, and this sink flushes it every N recorded events and on
// an interval while anything is buffered. The timer is unreferenced, so an open
// trace never keeps the process alive; `close` stops it before the recorder's
// own final flush. A flush that fails is reported, never raised into the
// gateway (the recorder already declares what it could not write as a loss).

import type {
  ClientGatewayTraceArtifactInput,
  ClientGatewayTraceCheckpointInput,
  ClientGatewayTraceCheckpointResult,
  ClientGatewayTraceCloseInput,
  ClientGatewayTraceEventInput,
  ClientGatewayTraceManifest,
  ClientGatewayTraceRecordResult,
  ClientGatewayTraceSink,
  ClientGatewayTraceSinkStatus
} from "../../../../client-gateway/index.ts";
import type { AutomationStudioGatewayTraceFlushPolicy } from "./types.ts";

export class AutomationStudioGatewayTraceFlushingSink implements ClientGatewayTraceSink {
  private readonly inner: ClientGatewayTraceSink;
  private readonly everyEvents: number;
  private readonly reportFailure: (error: unknown) => void;
  private readonly timer: ReturnType<typeof setInterval>;
  private sinceFlush = 0;

  constructor(inner: ClientGatewayTraceSink, policy: AutomationStudioGatewayTraceFlushPolicy, reportFailure: (error: unknown) => void) {
    if (!Number.isInteger(policy.everyEvents) || policy.everyEvents < 1) throw new Error("gateway_trace.flush_every_events must be a positive integer");
    if (!Number.isFinite(policy.intervalMs) || policy.intervalMs <= 0) throw new Error("gateway_trace.flush_interval_ms must be a positive number");
    this.inner = inner;
    this.everyEvents = policy.everyEvents;
    this.reportFailure = reportFailure;
    this.timer = setInterval(() => this.flushBuffered(), policy.intervalMs);
    this.timer.unref?.();
  }

  record(input: ClientGatewayTraceEventInput): ClientGatewayTraceRecordResult {
    return this.counted(this.inner.record(input));
  }

  recordArtifact(input: ClientGatewayTraceArtifactInput): ClientGatewayTraceRecordResult {
    return this.counted(this.inner.recordArtifact(input));
  }

  markCheckpoint(input: ClientGatewayTraceCheckpointInput): ClientGatewayTraceCheckpointResult {
    return this.inner.markCheckpoint(input);
  }

  flush(): Promise<void> {
    this.sinceFlush = 0;
    return this.inner.flush();
  }

  close(input: ClientGatewayTraceCloseInput): Promise<ClientGatewayTraceManifest> {
    clearInterval(this.timer);
    return this.inner.close(input);
  }

  status(): ClientGatewayTraceSinkStatus {
    return this.inner.status();
  }

  private counted(result: ClientGatewayTraceRecordResult): ClientGatewayTraceRecordResult {
    if (result.status !== "recorded") return result;
    this.sinceFlush += 1;
    if (this.sinceFlush >= this.everyEvents) this.startFlush();
    return result;
  }

  private flushBuffered(): void {
    const status = this.inner.status();
    if (status.state === "recording" && status.bufferedEvents > 0) this.startFlush();
  }

  private startFlush(): void {
    this.flush().catch((error: unknown) => this.reportFailure(error));
  }
}
