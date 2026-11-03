import type { ChatRecordingSummary } from "../ports/index.ts";

/** One finished, described recording a person can attach to a message. */
export type AttachableRecording = { readonly id: string; readonly label: string };

/** The most recordings the list offers. */
export const MAX_ATTACHABLE = 10;

/**
 * The project's finished recordings that have a description, newest first.
 * Core's list holds every project of the domain and answers `description`
 * apart from `title`; a recording with no description is supporting evidence
 * nobody explained, so it is not offered.
 */
export function attachableRecordings(items: readonly ChatRecordingSummary[], projectId: string | undefined): AttachableRecording[] {
  return items
    .filter((item) => (item.status === "completed" || item.endedAt !== undefined) && (projectId === undefined || item.projectId === projectId))
    .map((item) => ({ item, label: (item.description ?? "").trim() }))
    .filter((entry) => entry.label !== "")
    .sort((left, right) => (right.item.startedAt ?? 0) - (left.item.startedAt ?? 0))
    .slice(0, MAX_ATTACHABLE)
    .map((entry) => ({ id: entry.item.id, label: entry.label }));
}
