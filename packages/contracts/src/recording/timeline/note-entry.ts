import type { TimelineBase } from "./timeline-base.js";

export type NoteEntry = TimelineBase & {
  type: "note";
  noteId: string;
};
