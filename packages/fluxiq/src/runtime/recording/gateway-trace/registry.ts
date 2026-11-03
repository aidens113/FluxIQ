// The episodes open right now, for input that arrives over HTTP rather than in
// the episode's own async context: run control names a run (`runId`, which is
// the episode id, D9), and cancelling a build names its project and Flow, the
// same key as build cancellation. A Flow can have several open episodes at
// once (a build and the trial it runs); they are listed in the order they
// opened, so the outermost comes first.

import type { AutomationStudioGatewayTraceOpenEpisode } from "./open-episode.ts";

export class AutomationStudioGatewayTraceRegistry {
  private readonly open = new Set<AutomationStudioGatewayTraceOpenEpisode>();

  add(episode: AutomationStudioGatewayTraceOpenEpisode): void {
    this.open.add(episode);
  }

  remove(episode: AutomationStudioGatewayTraceOpenEpisode): void {
    this.open.delete(episode);
  }

  /** The open episode whose id is `runId`, or nothing when none is open (the earliest opened, should two share it). */
  byRunId(runId: string): AutomationStudioGatewayTraceOpenEpisode | undefined {
    for (const episode of this.open) if (episode.episodeId === runId) return episode;
    return undefined;
  }

  /** The open episodes of one project's Flow, outermost first. */
  byFlow(projectId: string, flowId: string): readonly AutomationStudioGatewayTraceOpenEpisode[] {
    return [...this.open].filter((episode) => episode.projectId === projectId && episode.flowId === flowId);
  }

  /** How many episodes are open. */
  size(): number {
    return this.open.size;
  }
}
