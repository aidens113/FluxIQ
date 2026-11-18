import type { PanelChangeTopic } from "./types";

/** The part of Core's activity hub the topic hears: each event, with the project it belongs to. */
export type PanelActivitySource = {
  subscribe(listener: (event: { readonly subject: { readonly projectId: string } }) => void): () => void;
};

/**
 * Live activity as a topic: a change naming the project each time Core
 * publishes an activity event for one this caller may read. The hub is
 * process-wide, so `mayRead` must also say no to every project the selected
 * workspace does not hold (`caller-reads.ts`). The chat then reads the
 * project's activity when it moved
 * rather than on a timer. A burst of events for one project is one change
 * until the stream sends it. Authority that cannot be decided fails the
 * stream, as for threads.
 */
export function activityChangeTopic(activity: PanelActivitySource, mayRead: (projectId: string) => Promise<boolean>): PanelChangeTopic {
  return {
    start(sink) {
      let stopped = false;
      const unsubscribe = activity.subscribe((event) => {
        if (stopped) return;
        const projectId = event.subject.projectId;
        mayRead(projectId).then(
          (allowed) => {
            if (!stopped && allowed) sink.changed({ topic: "activity", projectId });
          },
          (error: unknown) => {
            /* best-effort: once stopped, no reader remains to tell */
            if (!stopped) sink.fail(error);
          }
        );
      });
      return () => {
        stopped = true;
        unsubscribe();
      };
    }
  };
}
