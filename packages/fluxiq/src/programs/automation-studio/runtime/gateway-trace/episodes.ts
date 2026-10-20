import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { ClientGatewayTraceCaptureSource, ClientGatewayTraceRecordResult, ClientGatewayTraceSink } from "../../../../client-gateway/index.ts";
import { ClientGatewayTraceRecorder } from "../../../../client-gateway/index.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL } from "./control-vocabulary.ts";
import { AutomationStudioGatewayTraceFlushingSink } from "./flushing-sink.ts";
import { AutomationStudioGatewayTraceOpenEpisode } from "./open-episode.ts";
import { screenAutomationStudioGatewayTracePayload } from "./payload-screen.ts";
import { AutomationStudioGatewayTraceRegistry } from "./registry.ts";
import { AutomationStudioGatewayTraceScreeningSink } from "./screening-sink.ts";
import { automationStudioGatewayTraceTerminationOf } from "./termination.ts";
import type {
  AutomationStudioGatewayTraceBufferLimits,
  AutomationStudioGatewayTraceControlEvent,
  AutomationStudioGatewayTraceEpisode,
  AutomationStudioGatewayTraceEpisodesOptions,
  AutomationStudioGatewayTraceFailure,
  AutomationStudioGatewayTraceTermination
} from "./types.ts";

const DEFAULT_BUFFER: AutomationStudioGatewayTraceBufferLimits = Object.freeze({ maxEvents: 50_000, maxArtifactBytes: 256 * 1024 * 1024 });
const COMPLETED: AutomationStudioGatewayTraceTermination = Object.freeze({ terminationReason: "completed", terminationDetail: null });

/**
 * One async-context frame: the episode it records into, or none yet for a
 * pending frame (a run, named only once its session is admitted), and the
 * frame it was entered from. A frame without an episode records into its
 * nearest ancestor's.
 */
type Frame = {
  open: AutomationStudioGatewayTraceOpenEpisode | undefined;
  parent: Frame | undefined;
  pending: boolean;
};

function reportToConsole(failure: AutomationStudioGatewayTraceFailure): void {
  // The error itself may quote a payload; only its kind is logged.
  const kind = failure.error instanceof Error ? failure.error.name : typeof failure.error;
  console.error(`Client gateway trace ${failure.stage} failed for episode ${failure.episodeId} (${kind}).`);
}

/**
 * Automation Studio's traced episodes (traces and offline trials, P2): each
 * build, trial and run opens one, and everything the client gateway sends and
 * receives on its behalf is recorded into its trace (D8). The open episode is
 * held in an async-context frame for the whole of its work, and the gateway
 * reads it through `gatewaySource` the way it reads the host lease and the
 * channel scope (`../environment/channel-scope.ts`), so two episodes of one
 * project running at once never share a trace. A nested episode (a trial
 * inside a build) replaces the frame for its own work; the parent's trace
 * records a control marker naming the child's trace when it opens and closes.
 *
 * Off, nothing is constructed: `run` only calls its work, `gatewaySource` is
 * undefined (the gateway is handed no source at all), and control input is not
 * recorded. Tracing never fails the work it traces: a trace that cannot open,
 * flush or close is reported, and the work goes on.
 */
export class AutomationStudioGatewayTraceEpisodes {
  /** What the host hands the client gateway as its `trace` source; undefined when tracing is off. */
  readonly gatewaySource: ClientGatewayTraceCaptureSource | undefined;
  /** The episodes open right now, for run control arriving over HTTP. */
  readonly registry = new AutomationStudioGatewayTraceRegistry();
  private readonly options: AutomationStudioGatewayTraceEpisodesOptions;
  private readonly frames = new AsyncLocalStorage<Frame>();
  private readonly streams: readonly string[];
  private readonly reportFailure: (failure: AutomationStudioGatewayTraceFailure) => void;

  constructor(options: AutomationStudioGatewayTraceEpisodesOptions) {
    const streams = [...options.gatewayStreams, AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL.stream];
    if (new Set(streams).size !== streams.length) throw new Error(`gateway_trace.streams must be distinct and must not include "${AUTOMATION_STUDIO_GATEWAY_TRACE_CONTROL.stream}"`);
    this.options = options;
    this.streams = Object.freeze(streams);
    this.reportFailure = options.reportFailure ?? reportToConsole;
    this.gatewaySource = options.enabled ? Object.freeze({ current: (): ClientGatewayTraceSink | undefined => this.current()?.sink }) : undefined;
  }

  /** The episode the calling async context runs in, or nothing outside every traced episode (or with tracing off). */
  current(): AutomationStudioGatewayTraceOpenEpisode | undefined {
    return innermost(this.frames.getStore());
  }

  /**
   * Runs `work` as one traced episode: opens its trace, runs the work inside
   * the episode's frame, then flushes and closes the trace with how the work
   * ended -- `completed` when it settled, `cancelled` on an `AbortError`,
   * `failed` on any other throw -- and answers or throws exactly what the work
   * did. Work the frame outlives (a promise left running) keeps the frame, and
   * its later events are refused by the closed trace.
   */
  async run<T>(episode: AutomationStudioGatewayTraceEpisode, work: () => Promise<T>): Promise<T> {
    if (!this.options.enabled) return work();
    const traceId = this.options.newTraceId?.() ?? `trace.${randomUUID()}`;
    let open: AutomationStudioGatewayTraceOpenEpisode;
    try {
      open = this.open(episode, traceId);
    } catch (error) {
      // A trace that cannot open is reported, and the work runs untraced.
      this.reportFailure({ stage: "open", episodeId: episode.episodeId, traceId, error });
      return work();
    }
    const parentFrame = this.frames.getStore();
    const parent = innermost(parentFrame);
    this.announce(open, parent);
    let result: T;
    try {
      result = await this.frames.run({ open, parent: parentFrame, pending: false }, work);
    } catch (error) {
      await this.finish(open, parent, automationStudioGatewayTraceTerminationOf(error));
      throw error;
    }
    await this.finish(open, parent, COMPLETED);
    return result;
  }

  /**
   * Runs `work` in a pending frame: an episode whose identity is known only
   * part way through the work (a run is named when its session is admitted).
   * Until `bindPending` names it, the frame records into the episode it was
   * entered from, if any; once named, the rest of the work records into the
   * named episode's trace, which closes with how the work ended, as `run`'s
   * does. Never named, nothing is opened. Off, it only calls its work.
   */
  async runPending<T>(work: () => Promise<T>): Promise<T> {
    if (!this.options.enabled) return work();
    const frame: Frame = { open: undefined, parent: this.frames.getStore(), pending: true };
    let result: T;
    try {
      result = await this.frames.run(frame, work);
    } catch (error) {
      if (frame.open !== undefined) await this.finish(frame.open, innermost(frame.parent), automationStudioGatewayTraceTerminationOf(error));
      throw error;
    }
    if (frame.open !== undefined) await this.finish(frame.open, innermost(frame.parent), COMPLETED);
    return result;
  }

  /**
   * Names the calling context's pending frame: opens `episode`'s trace, which
   * the rest of the frame's work records into. Nothing happens outside a
   * pending frame, for a frame already named, or with tracing off; a trace
   * that cannot open is reported and the work goes on untraced.
   */
  bindPending(episode: AutomationStudioGatewayTraceEpisode): void {
    if (!this.options.enabled) return;
    const frame = this.frames.getStore();
    if (frame === undefined || !frame.pending || frame.open !== undefined) return;
    const traceId = this.options.newTraceId?.() ?? `trace.${randomUUID()}`;
    try {
      frame.open = this.open(episode, traceId);
    } catch (error) {
      this.reportFailure({ stage: "open", episodeId: episode.episodeId, traceId, error });
    }
    if (frame.open !== undefined) this.announce(frame.open, innermost(frame.parent));
  }

  /**
   * Records a control event (an input that reached Core outside the socket)
   * into `episode`, or into the calling context's episode when none is given.
   * Nothing is recorded, and nothing is answered, with tracing off or outside
   * every episode.
   */
  recordControl(event: AutomationStudioGatewayTraceControlEvent, episode?: AutomationStudioGatewayTraceOpenEpisode): ClientGatewayTraceRecordResult | undefined {
    if (!this.options.enabled) return undefined;
    const target = episode ?? this.current();
    return target?.recordControl(event);
  }

  /** Throws when the trace cannot open: no store for the project, or a recorder or flush policy that refuses. */
  private open(episode: AutomationStudioGatewayTraceEpisode, traceId: string): AutomationStudioGatewayTraceOpenEpisode {
    const buffer = this.options.buffer ?? DEFAULT_BUFFER;
    const recorder = new ClientGatewayTraceRecorder(
      {
        traceId,
        episodeId: episode.episodeId,
        activity: episode.activity,
        origin: episode.origin ?? { kind: "live" },
        contractVersions: this.options.contractVersions,
        capabilities: null,
        context: { schema: episode.context.schema, value: screenedContext(episode.context.value) },
        streams: this.streams
      },
      { store: this.options.storeFor(episode.projectId), now: this.options.now, maxBufferedEvents: buffer.maxEvents, maxBufferedArtifactBytes: buffer.maxArtifactBytes }
    );
    const flushing = new AutomationStudioGatewayTraceFlushingSink(recorder, this.options.flush, (error) => this.reportFailure({ stage: "flush", episodeId: episode.episodeId, traceId, error }));
    return new AutomationStudioGatewayTraceOpenEpisode({
      projectId: episode.projectId,
      episodeId: episode.episodeId,
      traceId,
      activity: episode.activity,
      flowId: episode.flowId ?? null,
      sink: new AutomationStudioGatewayTraceScreeningSink(flushing)
    });
  }

  /** Lists an opened episode for run control, and tells the parent's trace a child opened. */
  private announce(open: AutomationStudioGatewayTraceOpenEpisode, parent: AutomationStudioGatewayTraceOpenEpisode | undefined): void {
    this.registry.add(open);
    parent?.recordControl({ type: "child_episode_opened", payload: { traceId: open.traceId, episodeId: open.episodeId, activity: open.activity } });
  }

  /** Closes the trace and tells the parent; never throws, so the work's own outcome is what the caller sees. */
  private async finish(open: AutomationStudioGatewayTraceOpenEpisode, parent: AutomationStudioGatewayTraceOpenEpisode | undefined, termination: AutomationStudioGatewayTraceTermination): Promise<void> {
    try {
      await open.close(termination);
    } catch (error) {
      this.reportFailure({ stage: "close", episodeId: open.episodeId, traceId: open.traceId, error });
    } finally {
      this.registry.remove(open);
    }
    parent?.recordControl({ type: "child_episode_closed", payload: { traceId: open.traceId, episodeId: open.episodeId, terminationReason: termination.terminationReason } });
  }
}

/** The episode a frame records into: its own, or its nearest ancestor's. */
function innermost(frame: Frame | undefined): AutomationStudioGatewayTraceOpenEpisode | undefined {
  for (let current = frame; current !== undefined; current = current.parent) {
    if (current.open !== undefined) return current.open;
  }
  return undefined;
}

/**
 * The manifest context with secrets withheld (D15): the program's context is
 * read from what Core stored -- a run's inputs, a build's instructions, the
 * chat turn that started it -- and is screened as an event payload is.
 */
function screenedContext(value: unknown): unknown {
  const screened = screenAutomationStudioGatewayTracePayload({ encoding: "json", value });
  return screened.payload.encoding === "json" ? screened.payload.value : value;
}
