// Recordings: what can be asked for about one that already exists.
//
// Starting and finishing a recording are not here. They need the browser in
// front of the person, and `PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY` says so.

import { AUTOMATION_RECORDING_ENDPOINTS } from "../../../recordings";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT, RECORDING, PIN } from "./argument";
import { str } from "./value";

export const RECORDING_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "recording.note",
    title: "Note something on a recording",
    summary: "Writes a note, or drops a marker, at a point in a recording.",
    group: "Recordings",
    phrases: ["make a note", "note this", "mark this point", "add a marker", "flag this"],
    control: { view: automationStudioViewId.recordingTimeline, label: "Add note" },
    endpoints: [AUTOMATION_RECORDING_ENDPOINTS.appendNote, AUTOMATION_RECORDING_ENDPOINTS.appendMarker],
    arguments: [
      PROJECT,
      RECORDING,
      { name: "text", kind: "text", describe: "What to write, or what to call the marker.", required: true },
      { name: "asMarker", kind: "boolean", describe: "True to drop a marker rather than write a note.", required: false },
      PIN
    ],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      const marker = args.asMarker === true || args.asMarker === "true";
      return panelCapabilityResult(
        await context.transport.post(marker ? AUTOMATION_RECORDING_ENDPOINTS.appendMarker : AUTOMATION_RECORDING_ENDPOINTS.appendNote, {
          projectId: str(args, "projectId"),
          recordingId: str(args, "recordingId"),
          authorizationPin: str(args, "authorizationPin"),
          ...(marker ? { label: str(args, "text"), linkedEntryIds: [] } : { text: str(args, "text"), linkedEntryIds: [] })
        }),
        marker ? "Dropped the marker." : "Wrote the note.",
        marker ? "The marker could not be dropped." : "The note could not be written."
      );
    }
  }),
  definePanelCapability({
    id: "recording.rename",
    title: "Rename a recording",
    summary: "Changes what a recording is called or what it says it is of.",
    group: "Recordings",
    phrases: ["rename the recording", "call the recording", "change the recording name"],
    control: { view: automationStudioViewId.recordingTimeline, label: "Rename" },
    endpoints: [AUTOMATION_RECORDING_ENDPOINTS.update],
    arguments: [PROJECT, RECORDING, { name: "name", kind: "text", describe: "The new name.", required: true }, PIN],
    consequences: ["modify_existing"],
    invoke: async (context, args) => panelCapabilityResult(
      await context.transport.post(AUTOMATION_RECORDING_ENDPOINTS.update, {
        projectId: str(args, "projectId"),
        recordingId: str(args, "recordingId"),
        name: str(args, "name"),
        authorizationPin: str(args, "authorizationPin")
      }),
      "Renamed the recording.",
      "The recording could not be renamed."
    )
  }),
  definePanelCapability({
    id: "recording.normalize",
    title: "Make sense of a recording",
    summary: "Turns a raw recording into the ordered timeline a Flow can be built from.",
    group: "Recordings",
    phrases: ["normalize the recording", "tidy up the recording", "build the timeline", "process the recording"],
    control: { view: automationStudioViewId.recordingTimeline, label: "Normalize" },
    endpoints: [AUTOMATION_RECORDING_ENDPOINTS.normalize, AUTOMATION_RECORDING_ENDPOINTS.normalizationReview],
    arguments: [PROJECT, RECORDING],
    consequences: ["modify_existing"],
    invoke: async (context, args) => {
      const timeline = await context.transport.post(AUTOMATION_RECORDING_ENDPOINTS.normalize, {
        projectId: str(args, "projectId"),
        recordingId: str(args, "recordingId")
      });
      if (!timeline.ok) return panelCapabilityResult(timeline, "", "The recording could not be made sense of.");
      // The review is what makes the result readable, and a recording that
      // normalized is worth keeping even when the review does not come back, so
      // its failure is reported beside the success rather than instead of it.
      const review = await context.transport.post(AUTOMATION_RECORDING_ENDPOINTS.normalizationReview, {
        projectId: str(args, "projectId"),
        recordingId: str(args, "recordingId")
      });
      return {
        status: "done",
        summary: review.ok ? "Made sense of the recording." : `Made sense of the recording, but the details could not be built: ${review.error ?? "no reason given"}`,
        payload: { timeline: timeline.payload, review: review.ok ? review.payload : null }
      };
    }
  }),
  definePanelCapability({
    id: "recording.delete",
    title: "Delete a recording",
    summary: "Removes one recording, or several at once. Asks for your PIN first.",
    group: "Recordings",
    phrases: ["delete the recording", "remove the recording", "clear the recordings", "throw the recording away"],
    control: { view: automationStudioViewId.recordingTimeline, label: "Delete" },
    endpoints: [AUTOMATION_RECORDING_ENDPOINTS.delete, AUTOMATION_RECORDING_ENDPOINTS.deleteMany],
    arguments: [
      PROJECT,
      { name: "recordingId", kind: "id", describe: "One recording.", required: false, fromContext: "recordingId" },
      { name: "recordingIds", kind: "json", describe: "Several recordings at once, instead of one.", required: false },
      PIN
    ],
    consequences: ["delete"],
    invoke: async (context, args) => {
      const many = Array.isArray(args.recordingIds) ? args.recordingIds.map(String).filter(Boolean) : [];
      if (many.length) {
        return panelCapabilityResult(
          await context.transport.post(AUTOMATION_RECORDING_ENDPOINTS.deleteMany, {
            projectId: str(args, "projectId"),
            recordingIds: many,
            authorizationPin: str(args, "authorizationPin")
          }),
          `Deleted ${many.length} recordings.`,
          "The recordings could not be deleted."
        );
      }
      return panelCapabilityResult(
        await context.transport.post(AUTOMATION_RECORDING_ENDPOINTS.delete, {
          projectId: str(args, "projectId"),
          recordingId: str(args, "recordingId"),
          authorizationPin: str(args, "authorizationPin")
        }),
        "Deleted the recording.",
        "The recording could not be deleted."
      );
    }
  })
];
